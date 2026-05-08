#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isMissingSecret } from "../env/lib";

const PROJECT = "agentchat";
const WEB_PKG = "agentchat-web";
const SERVER_PKG = "agentchat-server";
const REPO_CONVEX_ENV = ".env.convex.local";
const TREE_STATE_PARENT = path.join(
    os.homedir(),
    ".local",
    "state",
    "agentchat-trees",
);
const LEGACY_HOST_STATE_ROOT = path.join(
    os.homedir(),
    ".local",
    "state",
    "agentchat",
);
const LEGACY_HOST_CONFIG_DIR = path.join(os.homedir(), ".config", "agentchat");

type Dotenv = Record<string, string>;

function repoRoot(): string {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
        encoding: "utf8",
    }).trim();
}

function currentBranch(): string {
    const fromArg = process.argv[2]?.trim();
    if (fromArg) return fromArg;
    return execFileSync("git", ["symbolic-ref", "--short", "HEAD"], {
        encoding: "utf8",
    }).trim();
}

function isLinkedWorktree(repo: string): boolean {
    return fs.statSync(path.join(repo, ".git")).isFile();
}

// Collision-resistant slug: when sanitization changes the input we append a
// short hash of the original so e.g. `feature/foo` and `feature-foo` cannot
// land on the same per-tree state dir or stateId.
function sanitizeBranch(branch: string): string {
    const safe = branch.replace(/[^a-zA-Z0-9._-]/g, "-");
    if (safe === branch) return safe;
    const suffix = createHash("sha256")
        .update(branch)
        .digest("hex")
        .slice(0, 6);
    return `${safe}-${suffix}`;
}

function parseDotenv(text: string): Dotenv {
    const out: Dotenv = {};
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        let key = line.slice(0, eq).trim();
        if (key.startsWith("export ")) key = key.slice(7).trim();
        if (!key) continue;
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function readDotenv(absPath: string): Dotenv {
    if (!fs.existsSync(absPath)) return {};
    return parseDotenv(fs.readFileSync(absPath, "utf8"));
}

function renderDotenvValue(value: string): string {
    return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value)
        ? value
        : JSON.stringify(value);
}

function renderDotenv(header: string, values: Dotenv): string {
    const lines = [`# ${header}`, ""];
    for (const [key, value] of Object.entries(values)) {
        if (value.length === 0) continue;
        lines.push(`${key}=${renderDotenvValue(value)}`);
    }
    return `${lines.join("\n")}\n`;
}

function writeFileIfChanged(absPath: string, content: string): boolean {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    if (
        fs.existsSync(absPath) &&
        fs.readFileSync(absPath, "utf8") === content
    ) {
        return false;
    }
    const tmp = `${absPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, absPath);
    return true;
}

function buildPortlessUrl(
    packageShortName: string,
    branchPrefix: string | null,
): string {
    const subdomain = branchPrefix
        ? `${branchPrefix}.${packageShortName}.${PROJECT}`
        : `${packageShortName}.${PROJECT}`;
    return `https://${subdomain}.localhost`;
}

function wipeLegacyState(): void {
    let wiped = false;
    const legacyManifest = path.join(repoRoot(), ".agentchat", "local");
    if (fs.existsSync(legacyManifest)) {
        fs.rmSync(legacyManifest, { recursive: true, force: true });
        wiped = true;
    }
    if (fs.existsSync(LEGACY_HOST_STATE_ROOT)) {
        fs.rmSync(LEGACY_HOST_STATE_ROOT, { recursive: true, force: true });
        wiped = true;
    }
    if (fs.existsSync(LEGACY_HOST_CONFIG_DIR)) {
        fs.rmSync(LEGACY_HOST_CONFIG_DIR, { recursive: true, force: true });
        wiped = true;
    }
    if (wiped) {
        console.log("setup-tree: wiped legacy lane/host state");
    }
}

function loadConvexEnv(repoPath: string): Dotenv {
    const convexEnvPath = path.join(repoPath, REPO_CONVEX_ENV);
    if (!fs.existsSync(convexEnvPath)) {
        throw new Error(
            [
                `setup-tree: ${REPO_CONVEX_ENV} not found at ${convexEnvPath}.`,
                "Copy .env.convex.local.example, fill in your deployment, then mint shared secrets:",
                "  cp .env.convex.local.example .env.convex.local",
                "  bun run convex:gen-secrets >> .env.convex.local",
                "  bun run convex:env",
                "See docs/local_environment_setup_checklist.md.",
            ].join("\n"),
        );
    }
    return readDotenv(convexEnvPath);
}

function requireConvexSecret(convexEnv: Dotenv, key: string): string {
    const value = convexEnv[key]?.trim();
    if (isMissingSecret(value)) {
        throw new Error(
            [
                `setup-tree: ${key} missing from ${REPO_CONVEX_ENV}.`,
                "Mint shared secrets and push them to Convex:",
                "  bun run convex:gen-secrets >> .env.convex.local",
                "  bun run convex:env",
                "If you already minted server-side values on a previous checkout, migrate without rotating:",
                "  bun run env:sync-secrets",
            ].join("\n"),
        );
    }
    return value!;
}

function fillTemplate(
    template: unknown,
    repoPath: string,
): Record<string, unknown> {
    const cloned = JSON.parse(JSON.stringify(template)) as Record<
        string,
        unknown
    >;
    const agents = cloned.agents;
    if (Array.isArray(agents)) {
        for (const agent of agents) {
            if (!agent || typeof agent !== "object" || Array.isArray(agent))
                continue;
            const a = agent as Record<string, unknown>;
            if (a.rootPath === "<filled-by-setup-tree>") {
                a.rootPath = repoPath;
            }
            const runtime = a.runtime;
            if (
                runtime &&
                typeof runtime === "object" &&
                !Array.isArray(runtime)
            ) {
                const r = runtime as Record<string, unknown>;
                if (r.cwd === "<filled-by-setup-tree>") {
                    r.cwd = repoPath;
                }
            }
        }
    }
    return cloned;
}

async function main(): Promise<void> {
    wipeLegacyState();

    const repo = repoRoot();
    const branch = currentBranch();
    const branchSlug = sanitizeBranch(branch);
    const branchPrefix = isLinkedWorktree(repo) ? branchSlug : null;

    const treeStateRoot = path.join(TREE_STATE_PARENT, branchSlug);
    const xdgStateHome = path.join(treeStateRoot, "xdg");
    const logDir = path.join(treeStateRoot, "logs");
    fs.mkdirSync(xdgStateHome, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });

    const convexEnv = loadConvexEnv(repo);
    const convexCloudUrl = convexEnv.CONVEX_URL ?? "";

    const serverEnvPath = path.join(repo, "apps/server/.env.local");
    // Force-rewrite apps/server/.env.local from convexEnv on every run so a
    // fresh CONVEX_URL is picked up without manual editing.
    const serverEnv: Dotenv = {
        XDG_STATE_HOME: xdgStateHome,
        BACKEND_TOKEN_SECRET: requireConvexSecret(
            convexEnv,
            "BACKEND_TOKEN_SECRET",
        ),
        RUNTIME_INGRESS_SECRET: requireConvexSecret(
            convexEnv,
            "RUNTIME_INGRESS_SECRET",
        ),
        CONVEX_URL: convexCloudUrl,
    };

    writeFileIfChanged(
        serverEnvPath,
        renderDotenv(
            "Generated by scripts/local/setup-tree.ts. Re-run to refresh.",
            serverEnv,
        ),
    );

    const webEnvPath = path.join(repo, "apps/web/.env.local");
    const webEnv: Dotenv = {
        NEXT_PUBLIC_CONVEX_URL: convexCloudUrl,
        NEXT_PUBLIC_AGENTCHAT_SERVER_URL: buildPortlessUrl(
            SERVER_PKG,
            branchPrefix,
        ),
    };
    writeFileIfChanged(
        webEnvPath,
        renderDotenv(
            "Generated by scripts/local/setup-tree.ts. Re-run to refresh.",
            webEnv,
        ),
    );

    const templatePath = path.join(
        repo,
        "apps/server/agentchat.config.template.json",
    );
    const template = JSON.parse(
        fs.readFileSync(templatePath, "utf8"),
    ) as unknown;
    const filled = fillTemplate(template, repo);
    writeFileIfChanged(
        path.join(repo, "apps/server/agentchat.config.json"),
        `${JSON.stringify(filled, null, 4)}\n`,
    );

    const webUrl = buildPortlessUrl(WEB_PKG, branchPrefix);
    const serverUrl = buildPortlessUrl(SERVER_PKG, branchPrefix);
    console.log(
        `setup-tree: branch=${branch} (${branchPrefix ? "worktree" : "main"})`,
    );
    console.log(`  web URL:    ${webUrl}`);
    console.log(`  server URL: ${serverUrl}`);
    console.log(`  state:      ${treeStateRoot}`);
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "setup-tree failed.",
    );
    process.exitCode = 1;
});
