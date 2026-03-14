import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

import { trimTrailingSlash } from "./lib";

const DEFAULT_BASE_URL = "http://127.0.0.1:4040";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LOCAL_USERNAME = "smoke_1";
const DEFAULT_LOCAL_PASSWORD = "smoke_1_password";
type AuthProviderKind = "google" | "local";
type Identity = {
    subject: string;
    email: string;
    name: string;
};

type AgentchatConfig = {
    version: number;
    auth: {
        defaultProviderId?: string | null;
        providers?: Array<{
            id: string;
            kind: AuthProviderKind;
            enabled?: boolean;
        }>;
    };
    providers: Array<{
        id: string;
        enabled: boolean;
    }>;
    agents: Array<{
        id: string;
        enabled: boolean;
    }>;
};

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function getConfigPath(repoRoot: string): string {
    return path.join(repoRoot, "apps", "server", "agentchat.config.json");
}

function readConfig(configPath: string): AgentchatConfig {
    return JSON.parse(readFileSync(configPath, "utf8")) as AgentchatConfig;
}

function writeConfig(configPath: string, config: AgentchatConfig): void {
    writeFileSync(configPath, `${JSON.stringify(config, null, 4)}\n`, "utf8");
}

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function readAuthProviderKind(config: AgentchatConfig): AuthProviderKind {
    const providers = config.auth?.providers ?? [];
    const defaultProviderId = config.auth?.defaultProviderId ?? null;
    const activeProvider =
        providers.find(
            (provider) =>
                provider.id === defaultProviderId && provider.enabled !== false,
        ) ?? providers.find((provider) => provider.enabled !== false);

    return activeProvider?.kind ?? "google";
}

async function assertWebReady(baseUrl: string): Promise<void> {
    const response = await fetch(`${baseUrl}/chat`, {
        headers: {
            "cache-control": "no-store",
        },
    }).catch((error) => {
        throw new Error(
            `Web app is not reachable at ${baseUrl}. Start apps/web before running operator browser checks.`,
            { cause: error },
        );
    });

    invariant(response.ok, `Web app returned ${response.status} for /chat.`);
}

async function waitForReload() {
    await new Promise((resolve) => setTimeout(resolve, 800));
}

async function waitForAgentOption(
    page: import("playwright").Page,
    agentId: string,
): Promise<void> {
    await page
        .locator(`#sidebar-agent-select option[value="${agentId}"]`)
        .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
}

function runConvex<T>(params: {
    repoRoot: string;
    functionName: string;
    args: Record<string, unknown>;
    identity?: Identity;
    push?: boolean;
}): T {
    const command = [
        "convex",
        "run",
        params.functionName,
        JSON.stringify(params.args),
    ];
    if (params.push) {
        command.push("--push");
    }
    if (params.identity) {
        command.push("--identity", JSON.stringify(params.identity));
    }

    const result = spawnSync("bunx", command, {
        cwd: path.join(params.repoRoot, "packages", "convex"),
        encoding: "utf8",
    });

    if (result.status !== 0) {
        const stderr = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        throw new Error(`Convex command failed for ${params.functionName}: ${stderr}`);
    }

    const lines = (result.stdout ?? "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith("✔ "))
        .filter((line) => !line.startsWith("- "))
        .filter((line) => !line.startsWith("Preparing Convex functions"));

    return JSON.parse(lines.join("\n")) as T;
}

async function signInIfNeeded(
    page: import("playwright").Page,
    authProviderKind: AuthProviderKind,
    repoRoot: string,
): Promise<void> {
    if (authProviderKind === "google") {
        throw new Error(
            "Browser operator smoke is not scripted for Google auth. Use local auth for automated local browser checks.",
        );
    }

    const user = runConvex<{ _id: string } | null>({
        repoRoot,
        functionName: "users:getByUsernameInternal",
        args: { username: DEFAULT_LOCAL_USERNAME },
        push: true,
    });
    invariant(
        user?._id,
        "Missing seeded local user smoke_1. Run `bun run setup:local-auth-smoke` first.",
    );

    await page.getByTestId("local-username-input").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.getByTestId("local-username-input").fill(DEFAULT_LOCAL_USERNAME);
    await page.getByTestId("local-password-input").fill(DEFAULT_LOCAL_PASSWORD);
    await page.getByTestId("local-sign-in-button").click();
    await page.getByTestId("agent-select").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
}

async function main() {
    const baseUrl = trimTrailingSlash(process.argv[2]?.trim() || DEFAULT_BASE_URL);
    const repoRoot = getRepoRoot();
    const configPath = getConfigPath(repoRoot);
    const originalConfigText = readFileSync(configPath, "utf8");
    const originalConfig = JSON.parse(originalConfigText) as AgentchatConfig;
    const authProviderKind = readAuthProviderKind(originalConfig);

    await assertWebReady(baseUrl);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, authProviderKind, repoRoot);
        const agentSelect = page.getByTestId("agent-select");
        await agentSelect.waitFor({ timeout: DEFAULT_TIMEOUT_MS });
        await waitForAgentOption(page, "agentchat-test");

        const disableAgentConfig = structuredClone(originalConfig);
        const agent = disableAgentConfig.agents.find(
            (entry) => entry.id === "agentchat-test",
        );
        invariant(agent, "Missing agentchat-test in config.");
        agent.enabled = false;
        writeConfig(configPath, disableAgentConfig);
        await waitForReload();
        await page.reload({ waitUntil: "domcontentloaded" });
        await agentSelect.waitFor({ timeout: DEFAULT_TIMEOUT_MS });
        invariant(
            (await page.locator('option[value="agentchat-test"]').count()) === 0,
            "Disabled agentchat-test still appeared in the agent selector.",
        );

        const disableProviderConfig = structuredClone(originalConfig);
        const provider = disableProviderConfig.providers.find(
            (entry) => entry.id === "codex-main",
        );
        invariant(provider, "Missing codex-main in config.");
        provider.enabled = false;
        writeConfig(configPath, disableProviderConfig);
        await waitForReload();
        await page.reload({ waitUntil: "domcontentloaded" });
        await agentSelect.waitFor({ timeout: DEFAULT_TIMEOUT_MS });
        await page
            .locator('#sidebar-agent-select option[value=""]')
            .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
        invariant(
            await agentSelect.isDisabled(),
            "Agent selector should be disabled when all providers are disabled.",
        );
        invariant(
            (await agentSelect.inputValue()) === "",
            "Agent selector should clear the active agent when no agents remain.",
        );
        invariant(
            (await page.locator("#sidebar-agent-select option").count()) === 1,
            "Agent selector should collapse to the empty-state option only.",
        );

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    baseUrl,
                    checks: ["disabled agent hidden", "disabled provider empties agent list"],
                },
                null,
                2,
            ),
        );
    } finally {
        writeFileSync(configPath, originalConfigText, "utf8");
        await waitForReload();
        await browser.close();
    }
}

await main();
