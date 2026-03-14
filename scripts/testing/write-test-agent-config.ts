import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function resolveGitUserEmail(repoRoot: string): string | null {
    try {
        const value = execFileSync("git", ["config", "user.email"], {
            cwd: repoRoot,
            encoding: "utf8",
        }).trim();
        return value.length > 0 ? value : null;
    } catch {
        return null;
    }
}

type AuthMode = "google" | "local" | "disabled";

function resolveAuthMode(): AuthMode {
    const flag = process.argv.find((arg) => arg.startsWith("--auth-mode="));
    const value =
        flag?.slice("--auth-mode=".length).trim() ||
        process.env.AGENTCHAT_TEST_AUTH_MODE?.trim() ||
        "local";

    if (value === "google" || value === "local" || value === "disabled") {
        return value;
    }

    throw new Error(
        `Unsupported auth mode '${value}'. Expected 'google', 'local', or 'disabled'.`,
    );
}

function buildAuthConfig(authMode: AuthMode, allowedEmail: string) {
    if (authMode === "disabled") {
        return {
            defaultProviderId: "disabled-default",
            providers: [
                {
                    id: "disabled-default",
                    kind: "disabled" as const,
                    enabled: true,
                },
            ],
        };
    }

    if (authMode === "local") {
        return {
            defaultProviderId: "local-main",
            providers: [
                {
                    id: "local-main",
                    kind: "local" as const,
                    enabled: true,
                    allowSignup: false,
                },
            ],
        };
    }

    return {
        defaultProviderId: "google-main",
        providers: [
            {
                id: "google-main",
                kind: "google" as const,
                enabled: true,
                allowlistMode: "email" as const,
                allowedEmails: [allowedEmail],
                allowedDomains: [],
                googleHostedDomain: null,
            },
        ],
    };
}

function buildConfig(homeDir: string, authMode: AuthMode, allowedEmail: string) {
    const fixturesRoot = path.join(homeDir, "agents", "agentchat_test");

    return {
        version: 1,
        auth: buildAuthConfig(authMode, allowedEmail),
        providers: [
            {
                id: "codex-main",
                kind: "codex" as const,
                label: "Codex Main",
                enabled: true,
                idleTtlSeconds: 900,
                modelCacheTtlSeconds: 300,
                models: [
                    {
                        id: "gpt-5.1-codex-mini",
                        label: "GPT-5.1 Codex Mini",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            { id: "medium", label: "Medium", enabled: true },
                            { id: "high", label: "High", enabled: true },
                        ],
                    },
                    {
                        id: "gpt-5.4",
                        label: "GPT-5.4",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            {
                                id: "low",
                                label: "Low",
                                enabled: true,
                            },
                            {
                                id: "medium",
                                label: "Medium",
                                enabled: true,
                            },
                            { id: "high", label: "High", enabled: true },
                            { id: "xhigh", label: "X-High", enabled: true },
                        ],
                    },
                    {
                        id: "gpt-5.3-codex-spark",
                        label: "GPT-5.3 Codex Spark",
                        enabled: true,
                        supportsReasoning: true,
                        variants: [
                            { id: "low", label: "Low", enabled: true },
                            { id: "medium", label: "Medium", enabled: true },
                            { id: "high", label: "High", enabled: true },
                            { id: "xhigh", label: "X-High", enabled: true },
                        ],
                    },
                ],
                codex: {
                    command: "codex",
                    args: ["app-server"],
                    baseEnv: {},
                    cwd: fixturesRoot,
                },
            },
        ],
        agents: [
            {
                id: "agentchat-smoke",
                name: "Agentchat Smoke",
                description: "Ultra-cheap liveness fixture.",
                avatar: null,
                enabled: true,
                rootPath: path.join(fixturesRoot, "smoke"),
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.1-codex-mini",
                defaultVariant: "medium",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["smoke"],
                sortOrder: 10,
            },
            {
                id: "agentchat-test",
                name: "Agentchat Test",
                description: "Deterministic read-only Codex confidence fixture.",
                avatar: null,
                enabled: true,
                rootPath: fixturesRoot,
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.4",
                defaultVariant: "low",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["manual"],
                sortOrder: 20,
            },
            {
                id: "agentchat-workspace",
                name: "Agentchat Workspace",
                description:
                    "Small mutable workspace fixture for interruption and resume checks.",
                avatar: null,
                enabled: true,
                rootPath: path.join(fixturesRoot, "workspace"),
                providerIds: ["codex-main"],
                defaultProviderId: "codex-main",
                defaultModel: "gpt-5.4",
                defaultVariant: "low",
                modelAllowlist: [],
                variantAllowlist: [],
                tags: ["workspace"],
                sortOrder: 30,
            },
        ],
    };
}

const repoRoot = getRepoRoot();
const configPath = path.join(repoRoot, "apps/server/agentchat.config.json");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const fixturesRoot = path.join(os.homedir(), "agents", "agentchat_test");

for (const requiredPath of [
    fixturesRoot,
    path.join(fixturesRoot, "smoke"),
    path.join(fixturesRoot, "workspace"),
]) {
    if (!existsSync(requiredPath)) {
        throw new Error(`Missing test fixture path: ${requiredPath}`);
    }
}

if (existsSync(configPath) && !force) {
    throw new Error(
        `Refusing to overwrite ${configPath}. Re-run with --force if you want to replace it.`,
    );
}

const allowedEmail =
    process.env.AGENTCHAT_ALLOWED_EMAIL?.trim() ||
    resolveGitUserEmail(repoRoot) ||
    "operator@example.com";
const authMode = resolveAuthMode();

const config = buildConfig(os.homedir(), authMode, allowedEmail);
const json = `${JSON.stringify(config, null, 4)}\n`;

if (dryRun) {
    console.log(json);
    process.exit(0);
}

writeFileSync(configPath, json, "utf8");
console.log(`[agentchat] wrote ${configPath}`);
console.log(`[agentchat] auth provider kind: ${authMode}`);
if (authMode === "google") {
    console.log(`[agentchat] allowlisted email: ${allowedEmail}`);
}
