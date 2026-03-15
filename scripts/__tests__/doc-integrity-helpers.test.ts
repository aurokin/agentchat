import { describe, expect, test } from "bun:test";

import {
    extractBunRunCommands,
    extractMarkdownLinks,
    hasScript,
    resolveDocLinkTarget,
} from "../doc-integrity-helpers";

describe("extractBunRunCommands", () => {
    test("extracts root, cwd, and cd-prefixed bun run commands", () => {
        const commands = extractBunRunCommands(`
- \`bun run doctor:server\`
- \`bun run --cwd packages/convex codegen\`
- \`cd apps/mobile && bun run dev-client\`
`);

        expect(commands).toEqual([
            {
                raw: "bun run doctor:server",
                script: "doctor:server",
                cwd: null,
            },
            {
                raw: "bun run --cwd packages/convex codegen",
                script: "codegen",
                cwd: "packages/convex",
            },
            {
                raw: "cd apps/mobile && bun run dev-client",
                script: "dev-client",
                cwd: "apps/mobile",
            },
        ]);
    });

    test("ignores placeholder commands", () => {
        expect(extractBunRunCommands("Use `bun run <script>` for scripts.")).toEqual(
            [],
        );
    });

    test("inherits code-fence cwd for subsequent bun run commands", () => {
        const commands = extractBunRunCommands(`
\`\`\`bash
cd apps/mobile
bun run dev-client
\`\`\`
`);

        expect(commands).toEqual([
            {
                raw: "bun run dev-client",
                script: "dev-client",
                cwd: "apps/mobile",
            },
        ]);
    });
});

describe("extractMarkdownLinks", () => {
    test("extracts local markdown links and skips remote links", () => {
        const links = extractMarkdownLinks(`
[Local](docs/agentchat/README.md)
[Absolute](/repo/docs/agentchat/README.md)
[Remote](https://openai.com)
`);

        expect(links).toEqual([
            {
                raw: "[Local](docs/agentchat/README.md)",
                target: "docs/agentchat/README.md",
            },
            {
                raw: "[Absolute](/repo/docs/agentchat/README.md)",
                target: "/repo/docs/agentchat/README.md",
            },
        ]);
    });
});

describe("resolveDocLinkTarget", () => {
    test("resolves relative, root-relative, and absolute repo links", () => {
        const rootDir = "/repo";
        const docPath = "/repo/docs/agentchat/testing-plan.md";

        expect(
            resolveDocLinkTarget({
                rootDir,
                docPath,
                target: "../README.md#overview",
            }),
        ).toBe("/repo/docs/README.md");
        expect(
            resolveDocLinkTarget({
                rootDir,
                docPath,
                target: "/apps/server/agentchat.config.example.json",
            }),
        ).toBe("/repo/apps/server/agentchat.config.example.json");
        expect(
            resolveDocLinkTarget({
                rootDir,
                docPath,
                target: "/repo/README.md",
            }),
        ).toBe("/repo/README.md");
    });
});

describe("hasScript", () => {
    test("detects scripts from package.json text", () => {
        expect(
            hasScript(
                JSON.stringify({
                    scripts: {
                        "doctor:server": "bun run --cwd apps/server doctor",
                    },
                }),
                "doctor:server",
            ),
        ).toBe(true);
        expect(
            hasScript(
                JSON.stringify({
                    scripts: {
                        lint: "eslint .",
                    },
                }),
                "doctor:server",
            ),
        ).toBe(false);
    });
});
