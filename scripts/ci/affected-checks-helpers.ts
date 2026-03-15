export type AffectedTarget =
    | "web"
    | "mobile"
    | "server"
    | "shared"
    | "convex"
    | "repo";

export type ParsedAffectedArgs = {
    baseRef: string | null;
    files: string[];
};

const REPO_WIDE_FILES = new Set([
    "package.json",
    "bun.lock",
    "tsconfig.json",
    "eslint.shared.mjs",
    "knip.jsonc",
]);

export function parseAffectedArgs(argv: string[]): ParsedAffectedArgs {
    const files: string[] = [];
    let baseRef: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--base") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--base requires a git ref.");
            }
            baseRef = value;
            index += 1;
            continue;
        }

        if (arg.startsWith("--")) {
            throw new Error(`Unsupported argument: ${arg}`);
        }

        files.push(arg);
    }

    return { baseRef, files };
}

export function detectAffectedTargets(files: string[]): Set<AffectedTarget> {
    const targets = new Set<AffectedTarget>();

    for (const file of files) {
        if (file.startsWith("apps/web/")) {
            targets.add("web");
            continue;
        }
        if (file.startsWith("apps/mobile/")) {
            targets.add("mobile");
            continue;
        }
        if (file.startsWith("apps/server/")) {
            targets.add("server");
            continue;
        }
        if (file.startsWith("packages/shared/")) {
            targets.add("shared");
            continue;
        }
        if (file.startsWith("packages/convex/")) {
            targets.add("convex");
            continue;
        }
        if (
            file.startsWith("scripts/") ||
            file.startsWith(".github/") ||
            REPO_WIDE_FILES.has(file)
        ) {
            targets.add("repo");
        }
    }

    return targets;
}

export function buildAffectedCommands(
    targets: Set<AffectedTarget>,
): Array<{ label: string; cmd: string }> {
    if (targets.has("repo")) {
        return [{ label: "repo", cmd: "bun run verify:ci" }];
    }

    const commands: Array<{ label: string; cmd: string }> = [];
    const orderedTargets: AffectedTarget[] = [
        "web",
        "mobile",
        "server",
        "shared",
        "convex",
    ];

    for (const target of orderedTargets) {
        if (!targets.has(target)) {
            continue;
        }

        commands.push({
            label: target,
            cmd: `bun run health:${target}`,
        });
    }

    return commands;
}
