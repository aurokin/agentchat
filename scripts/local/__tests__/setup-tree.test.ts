import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
const SETUP_TREE = path.join(REPO_ROOT, "scripts/local/setup-tree.ts");
const TEMPLATE = path.join(
    REPO_ROOT,
    "apps/server/agentchat.config.template.json",
);

const FIXTURE_BACKEND_TOKEN_SECRET = "fixture-backend-token-secret-value";
const FIXTURE_RUNTIME_INGRESS_SECRET = "fixture-runtime-ingress-secret-value";

function writeConvexLocal(
    repoRoot: string,
    extra: Record<string, string> = {},
): void {
    const merged: Record<string, string> = {
        BACKEND_TOKEN_SECRET: FIXTURE_BACKEND_TOKEN_SECRET,
        RUNTIME_INGRESS_SECRET: FIXTURE_RUNTIME_INGRESS_SECRET,
        ...extra,
    };
    const content =
        Object.entries(merged)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n") + "\n";
    fs.writeFileSync(path.join(repoRoot, ".env.convex.local"), content);
}

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
            writeConvexLocal(fixture.root);
            runSetupTree(fixture.root, fixture.fakeHome);

            // apps/web/.env.local is no longer generated — the web app
            // derives NEXT_PUBLIC_CONVEX_URL from .env.convex.local and
            // NEXT_PUBLIC_AGENTCHAT_SERVER_URL from `portless get` at
            // next.config.ts load time.
            expect(
                fs.existsSync(path.join(fixture.root, "apps/web/.env.local")),
            ).toBe(false);

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            // apps/server reads shared secrets from .env.convex.local via
            // --env-file. The only per-worktree value setup-tree still
            // writes is XDG_STATE_HOME.
            expect(serverEnv.BACKEND_TOKEN_SECRET).toBeUndefined();
            expect(serverEnv.RUNTIME_INGRESS_SECRET).toBeUndefined();
            expect(serverEnv.CONVEX_URL).toBeUndefined();
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
            // stateId/sandboxRoot are intentionally absent — config schema
            // defaults handle them; per-worktree isolation comes from
            // XDG_STATE_HOME. agent.rootPath / runtime.cwd are committed
            // as "." sentinels and resolved against the config file's
            // directory at load time.
            expect(config.stateId).toBeUndefined();
            expect(config.sandboxRoot).toBeUndefined();
            expect(config.agents[0].rootPath).toBe(".");
            expect(config.agents[0].runtime.cwd).toBe(".");
        } finally {
            fixture.cleanup();
        }
    });

    test("does not duplicate convex creds into apps/server/.env.local", () => {
        const fixture = makeRepo();
        try {
            writeConvexLocal(fixture.root, {
                CONVEX_DEPLOYMENT: "dev:my-deployment",
                CONVEX_URL: "https://my-deployment.convex.cloud",
            });
            runSetupTree(fixture.root, fixture.fakeHome);

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            // apps/server consumes CONVEX_URL / shared secrets directly from
            // .env.convex.local via --env-file; setup-tree must not
            // duplicate them.
            expect(serverEnv.CONVEX_URL).toBeUndefined();
            expect(serverEnv.AGENTCHAT_CONVEX_SITE_URL).toBeUndefined();
            expect(serverEnv.BACKEND_TOKEN_SECRET).toBeUndefined();
            expect(serverEnv.RUNTIME_INGRESS_SECRET).toBeUndefined();
        } finally {
            fixture.cleanup();
        }
    });

    test("force-rewrites a stale apps/server/.env.local from convexEnv", () => {
        const fixture = makeRepo();
        try {
            writeConvexLocal(fixture.root, {
                CONVEX_DEPLOYMENT: "dev:my-deployment",
                CONVEX_URL: "https://my-deployment.convex.cloud",
            });
            fs.mkdirSync(path.join(fixture.root, "apps/server"), {
                recursive: true,
            });
            fs.writeFileSync(
                path.join(fixture.root, "apps/server/.env.local"),
                [
                    "# This file is generated by bun run bootstrap.",
                    "",
                    "AGENTCHAT_CONVEX_SITE_URL=https://stale.convex.site",
                    "CONVEX_URL=https://stale.convex.cloud",
                    "",
                ].join("\n"),
            );

            runSetupTree(fixture.root, fixture.fakeHome);

            const serverEnv = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            // Stale entries must not survive the rewrite — setup-tree no
            // longer writes shared secrets / Convex URLs into this file.
            expect(serverEnv.AGENTCHAT_CONVEX_SITE_URL).toBeUndefined();
            expect(serverEnv.CONVEX_URL).toBeUndefined();
            expect(serverEnv.XDG_STATE_HOME).toBe(
                path.join(
                    fixture.fakeHome,
                    ".local/state/agentchat-trees/main/xdg",
                ),
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("re-runs are stable when convex env is unchanged", () => {
        const fixture = makeRepo();
        try {
            writeConvexLocal(fixture.root);
            runSetupTree(fixture.root, fixture.fakeHome);
            const first = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            runSetupTree(fixture.root, fixture.fakeHome);
            const second = readEnv(
                path.join(fixture.root, "apps/server/.env.local"),
            );
            expect(second.XDG_STATE_HOME).toBe(first.XDG_STATE_HOME);
        } finally {
            fixture.cleanup();
        }
    });

    test("fails loudly when .env.convex.local is missing", () => {
        const fixture = makeRepo();
        try {
            const result = spawnSync("bun", [SETUP_TREE], {
                cwd: fixture.root,
                env: { ...process.env, HOME: fixture.fakeHome },
                encoding: "utf8",
            });
            expect(result.status).not.toBe(0);
            const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
            expect(output).toContain(".env.convex.local");
            expect(output).toContain("convex:gen-secrets");
        } finally {
            fixture.cleanup();
        }
    });

    test("fails loudly when shared secrets missing from convex env", () => {
        const fixture = makeRepo();
        try {
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:my-deployment\n",
            );
            const result = spawnSync("bun", [SETUP_TREE], {
                cwd: fixture.root,
                env: { ...process.env, HOME: fixture.fakeHome },
                encoding: "utf8",
            });
            expect(result.status).not.toBe(0);
            const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
            expect(output).toContain("BACKEND_TOKEN_SECRET");
            expect(output).toContain("env:sync-secrets");
        } finally {
            fixture.cleanup();
        }
    });

    test("slug collisions are avoided across different branches", () => {
        const slashed = makeRepo();
        const dashed = makeRepo();
        try {
            writeConvexLocal(slashed.root);
            writeConvexLocal(dashed.root);
            runSetupTree(slashed.root, slashed.fakeHome, "feature/foo");
            runSetupTree(dashed.root, dashed.fakeHome, "feature-foo");

            const slashedXdg = readEnv(
                path.join(slashed.root, "apps/server/.env.local"),
            ).XDG_STATE_HOME;
            const dashedXdg = readEnv(
                path.join(dashed.root, "apps/server/.env.local"),
            ).XDG_STATE_HOME;
            expect(slashedXdg).not.toBe(dashedXdg);
            expect(dashedXdg).toBe(
                path.join(
                    dashed.fakeHome,
                    ".local/state/agentchat-trees/feature-foo/xdg",
                ),
            );
            expect(
                slashedXdg.startsWith(
                    path.join(
                        slashed.fakeHome,
                        ".local/state/agentchat-trees/feature-foo-",
                    ),
                ),
            ).toBe(true);
        } finally {
            slashed.cleanup();
            dashed.cleanup();
        }
    });

    test("uses worktree-distinct XDG_STATE_HOME in a linked worktree", () => {
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
            writeConvexLocal(worktreePath);

            runSetupTree(worktreePath, fixture.fakeHome);
            const serverEnv = readEnv(
                path.join(worktreePath, "apps/server/.env.local"),
            );
            expect(serverEnv.XDG_STATE_HOME).toBe(
                path.join(
                    fixture.fakeHome,
                    ".local/state/agentchat-trees/feat/xdg",
                ),
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
