import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const SETUP_TREE = path.join(REPO_ROOT, "scripts/local/setup-tree.ts");
const TEMPLATE = path.join(
    REPO_ROOT,
    "apps/server/agentchat.config.template.json",
);

function makeRepo(): {
    root: string;
    cleanup: () => void;
    fakeHome: string;
} {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "agentchat-setup-tree-")),
    );
    const fakeHome = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "agentchat-home-")),
    );
    fs.mkdirSync(path.join(root, "apps/web"), { recursive: true });
    fs.mkdirSync(path.join(root, "apps/server"), { recursive: true });
    fs.copyFileSync(
        TEMPLATE,
        path.join(root, "apps/server/agentchat.config.template.json"),
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
        cwd: root,
    });
    execFileSync("git", ["config", "user.name", "test"], { cwd: root });
    execFileSync("git", ["commit", "--allow-empty", "-q", "-m", "init"], {
        cwd: root,
    });
    return {
        root,
        fakeHome,
        cleanup: () => {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(fakeHome, { recursive: true, force: true });
        },
    };
}

function runSetupTree(
    repoRoot: string,
    fakeHome: string,
    branchArg?: string,
): void {
    const args = branchArg ? [SETUP_TREE, branchArg] : [SETUP_TREE];
    execFileSync("bun", args, {
        cwd: repoRoot,
        env: { ...process.env, HOME: fakeHome },
    });
}

function readEnv(absPath: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of fs.readFileSync(absPath, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
}

describe("setup-tree", () => {
    test("generates env files and config in main checkout", () => {
        const fixture = makeRepo();
        try {
            runSetupTree(fixture.root, fixture.fakeHome);

            const webEnv = readEnv(
                path.join(fixture.root, "apps/web/.env.local"),
            );
            expect(webEnv.NEXT_PUBLIC_AGENTCHAT_SERVER_URL).toBe(
                "https://agentchat-server.agentchat.localhost",
            );

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(serverEnv.BACKEND_TOKEN_SECRET.length).toBeGreaterThan(16);
            expect(serverEnv.RUNTIME_INGRESS_SECRET.length).toBeGreaterThan(16);
            expect(serverEnv.XDG_STATE_HOME).toBe(
                path.join(
                    fixture.fakeHome,
                    ".local/state/agentchat-trees/main/xdg",
                ),
            );

            const config = JSON.parse(
                fs.readFileSync(
                    path.join(
                        fixture.root,
                        "apps/server/agentchat.config.json",
                    ),
                    "utf8",
                ),
            );
            expect(config.stateId).toBe("main");
            expect(config.sandboxRoot).toBe(
                path.join(
                    fixture.fakeHome,
                    ".local/state/agentchat-trees/main/sandboxes",
                ),
            );
            expect(config.agents[0].rootPath).toBe(fixture.root);
            expect(config.agents[0].runtime.cwd).toBe(fixture.root);
        } finally {
            fixture.cleanup();
        }
    });

    test("sources convex creds from repo-local .env.convex.local", () => {
        const fixture = makeRepo();
        try {
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:my-deployment\nCONVEX_URL=https://my-deployment.convex.cloud\n",
            );
            runSetupTree(fixture.root, fixture.fakeHome);

            const webEnv = readEnv(
                path.join(fixture.root, "apps/web/.env.local"),
            );
            expect(webEnv.NEXT_PUBLIC_CONVEX_URL).toBe(
                "https://my-deployment.convex.cloud",
            );
            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(serverEnv.AGENTCHAT_CONVEX_SITE_URL).toBe(
                "https://my-deployment.convex.site",
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("replaces placeholder values from prior tooling", () => {
        const fixture = makeRepo();
        try {
            // Pre-seed with the kinds of placeholder values older tooling
            // wrote into apps/server/.env.local. setup-tree must replace
            // them, not preserve.
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:my-deployment\nCONVEX_URL=https://my-deployment.convex.cloud\n",
            );
            fs.mkdirSync(path.join(fixture.root, "apps/server"), {
                recursive: true,
            });
            fs.writeFileSync(
                path.join(fixture.root, "apps/server/.env.local"),
                [
                    "BACKEND_TOKEN_SECRET=replace-me",
                    "RUNTIME_INGRESS_SECRET=<filled-by-bootstrap>",
                    "AGENTCHAT_CONVEX_SITE_URL=https://example.convex.site",
                    "",
                ].join("\n"),
            );

            runSetupTree(fixture.root, fixture.fakeHome);

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(serverEnv.BACKEND_TOKEN_SECRET).not.toBe("replace-me");
            expect(serverEnv.BACKEND_TOKEN_SECRET.length).toBeGreaterThan(16);
            expect(serverEnv.RUNTIME_INGRESS_SECRET).not.toContain("<");
            expect(serverEnv.RUNTIME_INGRESS_SECRET.length).toBeGreaterThan(16);
            expect(serverEnv.AGENTCHAT_CONVEX_SITE_URL).toBe(
                "https://my-deployment.convex.site",
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("ignores legacy bootstrap-headered server env file", () => {
        const fixture = makeRepo();
        try {
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:my-deployment\nCONVEX_URL=https://my-deployment.convex.cloud\n",
            );
            fs.mkdirSync(path.join(fixture.root, "apps/server"), {
                recursive: true,
            });
            // The pre-portless harness wrote this header. Even with values
            // that aren't placeholders, the file is stale and must be
            // rewritten.
            fs.writeFileSync(
                path.join(fixture.root, "apps/server/.env.local"),
                [
                    "# This file is generated by bun run bootstrap.",
                    "# Manual edits are unsupported.",
                    "",
                    "BACKEND_TOKEN_SECRET=stale-from-old-harness",
                    "RUNTIME_INGRESS_SECRET=stale-from-old-harness",
                    "AGENTCHAT_CONVEX_SITE_URL=https://stale.convex.site",
                    "",
                ].join("\n"),
            );

            runSetupTree(fixture.root, fixture.fakeHome);

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(serverEnv.BACKEND_TOKEN_SECRET).not.toBe(
                "stale-from-old-harness",
            );
            expect(serverEnv.RUNTIME_INGRESS_SECRET).not.toBe(
                "stale-from-old-harness",
            );
            expect(serverEnv.AGENTCHAT_CONVEX_SITE_URL).toBe(
                "https://my-deployment.convex.site",
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("preserves secrets across re-runs", () => {
        const fixture = makeRepo();
        try {
            runSetupTree(fixture.root, fixture.fakeHome);
            const first = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            runSetupTree(fixture.root, fixture.fakeHome);
            const second = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(second.BACKEND_TOKEN_SECRET).toBe(
                first.BACKEND_TOKEN_SECRET,
            );
            expect(second.RUNTIME_INGRESS_SECRET).toBe(
                first.RUNTIME_INGRESS_SECRET,
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("slug collisions are avoided across different branches", () => {
        const slashed = makeRepo();
        const dashed = makeRepo();
        try {
            runSetupTree(slashed.root, slashed.fakeHome, "feature/foo");
            runSetupTree(dashed.root, dashed.fakeHome, "feature-foo");

            const slashedConfig = JSON.parse(
                fs.readFileSync(
                    path.join(
                        slashed.root,
                        "apps/server/agentchat.config.json",
                    ),
                    "utf8",
                ),
            );
            const dashedConfig = JSON.parse(
                fs.readFileSync(
                    path.join(dashed.root, "apps/server/agentchat.config.json"),
                    "utf8",
                ),
            );
            expect(slashedConfig.stateId).not.toBe(dashedConfig.stateId);
            expect(dashedConfig.stateId).toBe("feature-foo");
            expect(slashedConfig.stateId.startsWith("feature-foo-")).toBe(true);
        } finally {
            slashed.cleanup();
            dashed.cleanup();
        }
    });

    test("emits worktree-prefixed server URL in linked worktree", () => {
        const fixture = makeRepo();
        const worktreePath = `${fixture.root}.feat`;
        try {
            execFileSync(
                "git",
                ["worktree", "add", "-b", "feat", worktreePath],
                {
                    cwd: fixture.root,
                },
            );
            fs.mkdirSync(path.join(worktreePath, "apps/server"), {
                recursive: true,
            });
            fs.copyFileSync(
                TEMPLATE,
                path.join(
                    worktreePath,
                    "apps/server/agentchat.config.template.json",
                ),
            );

            runSetupTree(worktreePath, fixture.fakeHome);
            const webEnv = readEnv(
                path.join(worktreePath, "apps/web/.env.local"),
            );
            expect(webEnv.NEXT_PUBLIC_AGENTCHAT_SERVER_URL).toBe(
                "https://feat.agentchat-server.agentchat.localhost",
            );
        } finally {
            execFileSync(
                "git",
                ["worktree", "remove", "--force", worktreePath],
                {
                    cwd: fixture.root,
                },
            );
            fs.rmSync(worktreePath, { recursive: true, force: true });
            fixture.cleanup();
        }
    });
});
