import fs from "node:fs";
import path from "node:path";

type Group = "web" | "mobile" | "server" | "shared" | "convex";

type Violation = {
    importer: string;
    specifier: string;
    target: Group;
};

const CODE_EXTS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
]);

const EXCLUDED_DIR_NAMES = new Set([
    ".git",
    ".next",
    ".turbo",
    ".expo",
    "android",
    "ios",
    "build",
    "coverage",
    "dist",
    "node_modules",
]);

const IMPORT_RE =
    /(?:import|export)\s+(?:type\s+)?(?:[^"'`]*?\s+from\s+)?["']([^"'`]+)["']/g;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"'`]+)["']\s*\)/g;

const ALLOWED_IMPORTS: Record<Group, ReadonlySet<Group>> = {
    web: new Set(["web", "shared", "convex"]),
    mobile: new Set(["mobile", "shared", "convex"]),
    server: new Set(["server", "shared"]),
    shared: new Set(["shared"]),
    convex: new Set(["convex", "shared"]),
};

function isCodeFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) {
        return false;
    }

    return CODE_EXTS.has(path.extname(filePath));
}

function walkCodeFiles(rootDirAbs: string): string[] {
    const files: string[] = [];
    const stack = [rootDirAbs];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) break;

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const absPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (EXCLUDED_DIR_NAMES.has(entry.name)) {
                    continue;
                }
                stack.push(absPath);
                continue;
            }

            if (entry.isFile() && isCodeFile(absPath)) {
                files.push(absPath);
            }
        }
    }

    return files;
}

function toPosixPath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

function getGroupForRepoPath(relativePosixPath: string): Group | null {
    if (relativePosixPath.startsWith("apps/web/")) return "web";
    if (relativePosixPath.startsWith("apps/mobile/")) return "mobile";
    if (relativePosixPath.startsWith("apps/server/")) return "server";
    if (relativePosixPath.startsWith("packages/shared/")) return "shared";
    if (relativePosixPath.startsWith("packages/convex/")) return "convex";
    return null;
}

function extractSpecifiers(text: string): string[] {
    const specifiers = new Set<string>();

    for (const match of text.matchAll(IMPORT_RE)) {
        const specifier = match[1];
        if (specifier) {
            specifiers.add(specifier);
        }
    }

    for (const match of text.matchAll(DYNAMIC_IMPORT_RE)) {
        const specifier = match[1];
        if (specifier) {
            specifiers.add(specifier);
        }
    }

    return Array.from(specifiers);
}

function resolveAliasTargetGroup(
    specifier: string,
    importerGroup: Group,
): Group | null {
    if (specifier.startsWith("@shared/") || specifier === "@agentchat/shared") {
        return "shared";
    }

    if (specifier.startsWith("@convex/")) {
        return "convex";
    }

    if (specifier.startsWith("@/")) {
        if (importerGroup === "web" || importerGroup === "mobile") {
            return importerGroup;
        }
        return null;
    }

    return null;
}

function resolveTargetGroup(params: {
    rootDir: string;
    importerAbsPath: string;
    importerGroup: Group;
    specifier: string;
}): Group | null {
    const aliasTarget = resolveAliasTargetGroup(
        params.specifier,
        params.importerGroup,
    );
    if (aliasTarget !== null) {
        return aliasTarget;
    }

    if (
        !params.specifier.startsWith(".") &&
        !params.specifier.startsWith("/") &&
        !params.specifier.startsWith("file:")
    ) {
        return null;
    }

    const resolvedPath = params.specifier.startsWith("file:")
        ? new URL(params.specifier)
        : path.resolve(path.dirname(params.importerAbsPath), params.specifier);

    const resolvedFsPath =
        resolvedPath instanceof URL
            ? path.normalize(resolvedPath.pathname)
            : resolvedPath;
    const relativePath = toPosixPath(
        path.relative(params.rootDir, resolvedFsPath),
    );

    return getGroupForRepoPath(relativePath);
}

function main(): void {
    const rootDir = process.cwd();
    const codeFiles = [path.join(rootDir, "apps"), path.join(rootDir, "packages")]
        .flatMap(walkCodeFiles)
        .sort((a, b) => a.localeCompare(b));

    const violations: Violation[] = [];

    for (const absPath of codeFiles) {
        const relativePath = toPosixPath(path.relative(rootDir, absPath));
        const importerGroup = getGroupForRepoPath(relativePath);
        if (importerGroup === null) {
            continue;
        }

        let text: string;
        try {
            text = fs.readFileSync(absPath, "utf8");
        } catch {
            continue;
        }

        for (const specifier of extractSpecifiers(text)) {
            const targetGroup = resolveTargetGroup({
                rootDir,
                importerAbsPath: absPath,
                importerGroup,
                specifier,
            });
            if (targetGroup === null) {
                continue;
            }

            if (!ALLOWED_IMPORTS[importerGroup].has(targetGroup)) {
                violations.push({
                    importer: relativePath,
                    specifier,
                    target: targetGroup,
                });
            }
        }
    }

    if (violations.length === 0) {
        console.log("architecture check passed");
        return;
    }

    console.error("Architecture violations:");
    for (const violation of violations) {
        console.error(
            `- ${violation.importer} imports ${violation.specifier} (${violation.target})`,
        );
    }
    process.exitCode = 1;
}

main();
