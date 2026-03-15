import fs from "node:fs";
import path from "node:path";

export type DocCommandReference = {
    raw: string;
    script: string;
    cwd: string | null;
};

export type DocLinkReference = {
    raw: string;
    target: string;
};

export function listMarkdownFiles(rootDir: string): string[] {
    const markdownFiles: string[] = [];
    const includeRoots = [
        path.join(rootDir, "README.md"),
        path.join(rootDir, "AGENTS.md"),
        path.join(rootDir, "docs"),
        path.join(rootDir, "ai_docs"),
    ];

    for (const includeRoot of includeRoots) {
        if (!fs.existsSync(includeRoot)) {
            continue;
        }

        const stats = fs.statSync(includeRoot);
        if (stats.isFile()) {
            markdownFiles.push(includeRoot);
            continue;
        }

        const stack = [includeRoot];
        while (stack.length > 0) {
            const current = stack.pop();
            if (!current) {
                break;
            }

            for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
                const entryPath = path.join(current, entry.name);
                if (entry.isDirectory()) {
                    stack.push(entryPath);
                    continue;
                }
                if (entry.isFile() && entry.name.endsWith(".md")) {
                    markdownFiles.push(entryPath);
                }
            }
        }
    }

    return markdownFiles.sort((left, right) => left.localeCompare(right));
}

export function extractBunRunCommands(text: string): DocCommandReference[] {
    const commands: DocCommandReference[] = [];
    const commandPattern =
        /(?:cd\s+([^\s&;`]+)\s+&&\s+)?bun run(?:\s+--cwd\s+([^\s`]+))?\s+([A-Za-z0-9:_-]+)/gu;
    const standaloneCdPattern = /^cd\s+([^\s&;`]+)\s*$/u;
    let inCodeFence = false;
    let codeFenceCwd: string | null = null;

    for (const line of text.split(/\r?\n/u)) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("```")) {
            inCodeFence = !inCodeFence;
            codeFenceCwd = null;
            continue;
        }

        if (inCodeFence) {
            const standaloneCdMatch = trimmedLine.match(standaloneCdPattern);
            if (standaloneCdMatch?.[1]) {
                codeFenceCwd = standaloneCdMatch[1];
                continue;
            }
        }

        for (const match of line.matchAll(commandPattern)) {
            const script = match[3];
            if (!script || script.startsWith("<")) {
                continue;
            }

            commands.push({
                raw: match[0].trim(),
                script,
                cwd: match[2] ?? match[1] ?? codeFenceCwd,
            });
        }
    }

    return dedupeBy(commands, (command) => `${command.cwd ?? "."}:${command.script}:${command.raw}`);
}

export function extractMarkdownLinks(text: string): DocLinkReference[] {
    const references: DocLinkReference[] = [];
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/gu;

    for (const match of text.matchAll(linkPattern)) {
        const target = match[1]?.trim();
        if (!target || target.startsWith("http://") || target.startsWith("https://")) {
            continue;
        }

        references.push({
            raw: match[0],
            target,
        });
    }

    return dedupeBy(references, (reference) => `${reference.target}:${reference.raw}`);
}

export function resolveDocLinkTarget(params: {
    rootDir: string;
    docPath: string;
    target: string;
}): string | null {
    const cleanedTarget = params.target.split("#")[0]?.split("?")[0] ?? "";
    if (
        cleanedTarget.length === 0 ||
        cleanedTarget.startsWith("mailto:") ||
        cleanedTarget.startsWith("tel:")
    ) {
        return null;
    }

    const repoRootPrefix = `${params.rootDir}${path.sep}`;
    if (
        cleanedTarget.startsWith("/") &&
        !cleanedTarget.startsWith(repoRootPrefix)
    ) {
        return path.join(params.rootDir, cleanedTarget.slice(1));
    }

    if (path.isAbsolute(cleanedTarget)) {
        return cleanedTarget;
    }

    return path.resolve(path.dirname(params.docPath), cleanedTarget);
}

export function hasScript(packageJsonText: string, scriptName: string): boolean {
    const packageJson = JSON.parse(packageJsonText) as {
        scripts?: Record<string, string>;
    };
    return scriptName in (packageJson.scripts ?? {});
}

function dedupeBy<T>(values: T[], keyFn: (value: T) => string): T[] {
    const seen = new Set<string>();
    const deduped: T[] = [];

    for (const value of values) {
        const key = keyFn(value);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(value);
    }

    return deduped;
}
