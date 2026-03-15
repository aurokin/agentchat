import fs from "node:fs";
import path from "node:path";

type CountKey =
    | "as_any"
    | "type_any"
    | "ts_ignore"
    | "ts_expect_error"
    | "eslint_disable";

type Counts = Record<CountKey, number>;

type BaselineFile = {
    counts: Counts;
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
    "_generated",
]);

const PATTERNS: Record<CountKey, RegExp> = {
    as_any: /\bas\s+any\b/g,
    type_any: /:\s*any\b/g,
    ts_ignore: /@ts-ignore\b/g,
    ts_expect_error: /@ts-expect-error\b/g,
    eslint_disable: /eslint-disable\b/g,
};

function emptyCounts(): Counts {
    return {
        as_any: 0,
        type_any: 0,
        ts_ignore: 0,
        ts_expect_error: 0,
        eslint_disable: 0,
    };
}

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

function parseArgs(argv: string[]) {
    let baselinePath: string | null = null;
    let writeBaselinePath: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--baseline") {
            baselinePath = argv[index + 1] ?? null;
            index += 1;
            continue;
        }
        if (arg === "--write-baseline") {
            writeBaselinePath = argv[index + 1] ?? null;
            index += 1;
        }
    }

    return { baselinePath, writeBaselinePath };
}

function countMatches(text: string, pattern: RegExp): number {
    return Array.from(text.matchAll(pattern)).length;
}

function loadBaseline(absPath: string): BaselineFile {
    return JSON.parse(fs.readFileSync(absPath, "utf8")) as BaselineFile;
}

function main(): void {
    const rootDir = process.cwd();
    const { baselinePath, writeBaselinePath } = parseArgs(process.argv.slice(2));
    const counts = emptyCounts();
    const roots = [
        path.join(rootDir, "apps"),
        path.join(rootDir, "packages"),
        path.join(rootDir, "scripts"),
    ];

    for (const absPath of roots.flatMap(walkCodeFiles)) {
        let text: string;
        try {
            text = fs.readFileSync(absPath, "utf8");
        } catch {
            continue;
        }

        for (const key of Object.keys(PATTERNS) as CountKey[]) {
            counts[key] += countMatches(text, PATTERNS[key]);
        }
    }

    console.log("type suppression counts:");
    for (const key of Object.keys(counts) as CountKey[]) {
        console.log(`- ${key}: ${counts[key]}`);
    }

    if (writeBaselinePath) {
        const absPath = path.join(rootDir, writeBaselinePath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, `${JSON.stringify({ counts }, null, 4)}\n`);
        console.log(`wrote baseline ${writeBaselinePath}`);
    }

    if (!baselinePath) {
        return;
    }

    const baseline = loadBaseline(path.join(rootDir, baselinePath));
    const regressions: string[] = [];

    for (const key of Object.keys(counts) as CountKey[]) {
        const limit = baseline.counts[key];
        if (counts[key] > limit) {
            regressions.push(`${key}: ${counts[key]} > ${limit}`);
        }
    }

    if (regressions.length === 0) {
        console.log("type suppression check passed");
        return;
    }

    console.error("type suppression regressions:");
    for (const regression of regressions) {
        console.error(`- ${regression}`);
    }
    process.exitCode = 1;
}

main();
