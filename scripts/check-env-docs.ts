import fs from "node:fs";
import path from "node:path";

type ScanSets = {
    all: Set<string>;
    web: Set<string>;
    mobile: Set<string>;
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
    "node_modules",
    ".next",
    ".turbo",
    ".expo",
    "dist",
    "build",
    "coverage",
    ".cache",
    "_generated",
]);

const STANDARD_ENV_VARS = new Set(["NODE_ENV"]);

const RE_PROCESS_ENV_DOT = /process\.env\.([A-Z0-9_]+)/g;
const RE_PROCESS_ENV_BRACKET = /process\.env\[['\"]([A-Z0-9_]+)['\"]\]/g;
const RE_BUN_ENV_DOT = /Bun\.env\.([A-Z0-9_]+)/g;
const RE_BUN_ENV_BRACKET = /Bun\.env\[['\"]([A-Z0-9_]+)['\"]\]/g;
const RE_DENO_ENV_GET = /Deno\.env\.get\(\s*['\"]([A-Z0-9_]+)['\"]/g;
const RE_READ_POSITIVE_INT_ENV =
    /readPositiveIntEnv\((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*['\"]([A-Z0-9_]+)['\"]/g;

function readTextIfExists(filePath: string): string {
    if (!fs.existsSync(filePath)) {
        return "";
    }
    return fs.readFileSync(filePath, "utf8");
}

function toPosixPath(filePath: string): string {
    return filePath.split(path.sep).join("/");
}

function isCodeFile(filePath: string): boolean {
    if (filePath.endsWith(".d.ts")) return false;
    return CODE_EXTS.has(path.extname(filePath));
}

function extractEnvVars(text: string): Set<string> {
    const out = new Set<string>();
    for (const match of text.matchAll(RE_PROCESS_ENV_DOT)) {
        const v = match[1];
        if (v) out.add(v);
    }
    for (const match of text.matchAll(RE_PROCESS_ENV_BRACKET)) {
        const v = match[1];
        if (v) out.add(v);
    }
    for (const match of text.matchAll(RE_BUN_ENV_DOT)) {
        const v = match[1];
        if (v) out.add(v);
    }
    for (const match of text.matchAll(RE_BUN_ENV_BRACKET)) {
        const v = match[1];
        if (v) out.add(v);
    }
    for (const match of text.matchAll(RE_DENO_ENV_GET)) {
        const v = match[1];
        if (v) out.add(v);
    }
    for (const match of text.matchAll(RE_READ_POSITIVE_INT_ENV)) {
        const v = match[1];
        if (v) out.add(v);
    }
    return out;
}

function walkCodeFiles(rootDirAbs: string): string[] {
    const files: string[] = [];
    const stack: string[] = [rootDirAbs];

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
            if (entry.isDirectory()) {
                if (EXCLUDED_DIR_NAMES.has(entry.name)) {
                    continue;
                }
                stack.push(path.join(current, entry.name));
                continue;
            }

            if (!entry.isFile()) continue;
            const absPath = path.join(current, entry.name);
            if (!isCodeFile(absPath)) continue;
            files.push(absPath);
        }
    }

    return files;
}

function addToScopeSets(
    sets: ScanSets,
    relativePosixPath: string,
    vars: Set<string>,
): void {
    for (const v of vars) {
        sets.all.add(v);
        if (relativePosixPath.startsWith("apps/web/")) {
            sets.web.add(v);
        } else if (relativePosixPath.startsWith("apps/mobile/")) {
            sets.mobile.add(v);
        }
    }
}

function sorted(values: Iterable<string>): string[] {
    return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function diff(a: Set<string>, b: string): string[] {
    const missing = new Set<string>();
    for (const v of a) {
        if (STANDARD_ENV_VARS.has(v)) continue;
        if (!b.includes(v)) {
            missing.add(v);
        }
    }
    return sorted(missing);
}

function main(): void {
    const root = process.cwd();

    const readme = readTextIfExists(path.join(root, "README.md"));
    const webEnvExample = readTextIfExists(
        path.join(root, "apps/web/.env.example"),
    );
    const mobileEnvExample = readTextIfExists(
        path.join(root, "apps/mobile/.env.example"),
    );

    const codeRootsAbs = [path.join(root, "apps"), path.join(root, "packages")];
    const codeFilesAbs = codeRootsAbs.flatMap(walkCodeFiles);

    const sets: ScanSets = {
        all: new Set<string>(),
        web: new Set<string>(),
        mobile: new Set<string>(),
    };

    for (const absPath of codeFilesAbs) {
        let text: string;
        try {
            text = fs.readFileSync(absPath, "utf8");
        } catch {
            continue;
        }
        const vars = extractEnvVars(text);
        if (vars.size === 0) continue;

        const rel = toPosixPath(path.relative(root, absPath));
        addToScopeSets(sets, rel, vars);
    }

    const missingInReadme = diff(sets.all, readme);
    const missingInWebEnvExample = diff(sets.web, webEnvExample);
    const missingInMobileEnvExample = diff(sets.mobile, mobileEnvExample);

    // Tooling env vars may not appear in source code.
    const requiredToolingVars = [
        {
            name: "CONVEX_DEPLOYMENT",
            files: ["README.md", "packages/convex/.env.example"],
        },
    ];

    const missingRequired: { varName: string; missingFrom: string[] }[] = [];
    for (const requirement of requiredToolingVars) {
        const missingFrom: string[] = [];
        for (const relPath of requirement.files) {
            const content = readTextIfExists(path.join(root, relPath));
            if (!content.includes(requirement.name)) {
                missingFrom.push(relPath);
            }
        }
        if (missingFrom.length > 0) {
            missingRequired.push({
                varName: requirement.name,
                missingFrom,
            });
        }
    }

    const hasFailures =
        missingInReadme.length > 0 ||
        missingInWebEnvExample.length > 0 ||
        missingInMobileEnvExample.length > 0 ||
        missingRequired.length > 0;

    if (!hasFailures) {
        console.log(
            `env docs check passed (tracked ${sets.all.size} vars; ignored ${STANDARD_ENV_VARS.size} standard vars)`,
        );
        return;
    }

    if (missingInReadme.length > 0) {
        console.error("Missing in README.md:");
        for (const v of missingInReadme) {
            console.error(`- ${v}`);
        }
        console.error("");
    }

    if (missingInWebEnvExample.length > 0) {
        console.error("Missing in apps/web/.env.example:");
        for (const v of missingInWebEnvExample) {
            console.error(`- ${v}`);
        }
        console.error("");
    }

    if (missingInMobileEnvExample.length > 0) {
        console.error("Missing in apps/mobile/.env.example:");
        for (const v of missingInMobileEnvExample) {
            console.error(`- ${v}`);
        }
        console.error("");
    }

    if (missingRequired.length > 0) {
        console.error("Missing required (tooling) env vars:");
        for (const m of missingRequired) {
            console.error(
                `- ${m.varName} missing from: ${m.missingFrom.join(", ")}`,
            );
        }
        console.error("");
    }

    console.error(
        "Update README.md and the relevant .env.example file(s), then re-run: bun run env:check",
    );
    process.exit(1);
}

main();
