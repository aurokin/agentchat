import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

import {
    buildBrowserConfidenceFailureReport,
    buildBrowserConfidenceSuccessReport,
    formatBrowserConfidenceText,
    parseBrowserConfidenceArgs,
    type BrowserConfidenceArgs,
} from "./browser-confidence-helpers";

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
    auth?: {
        defaultProviderId?: string | null;
        providers?: Array<{
            id: string;
            kind: AuthProviderKind;
            enabled?: boolean;
        }>;
    };
};

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

function getOutputDir(repoRoot: string): string {
    return path.join(repoRoot, "output", "playwright");
}

function getConfigPath(repoRoot: string): string {
    return path.join(repoRoot, "apps", "server", "agentchat.config.json");
}

function readAuthProviderKind(repoRoot: string): AuthProviderKind {
    const config = JSON.parse(
        readFileSync(getConfigPath(repoRoot), "utf8"),
    ) as AgentchatConfig;
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
            `Web app is not reachable at ${baseUrl}. Start apps/web before running browser confidence checks.`,
            { cause: error },
        );
    });

    invariant(response.ok, `Web app returned ${response.status} for /chat.`);
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

    if (lines.length === 0) {
        return null as T;
    }

    return JSON.parse(lines.join("\n")) as T;
}

function runConvexReset(repoRoot: string, authProviderKind: AuthProviderKind): void {
    if (authProviderKind === "google") {
        throw new Error(
            "Browser confidence is not scripted for Google auth. Use the local auth path for automated local browser checks.",
        );
    }

    const user = runConvex<{ _id: string; email?: string | null } | null>({
        repoRoot,
        functionName: "users:getByUsernameInternal",
        args: { username: DEFAULT_LOCAL_USERNAME },
        push: true,
    });
    invariant(
        user?._id,
        "Missing seeded local user smoke_1. Run `bun run setup:local-auth-smoke` first.",
    );
    runConvex({
        repoRoot,
        functionName: "users:resetWorkspaceData",
        args: {},
        identity: {
            subject: user._id,
            email: user.email ?? `${DEFAULT_LOCAL_USERNAME}@local.agentchat`,
            name: DEFAULT_LOCAL_USERNAME,
        },
    });
}

async function signInIfNeeded(
    page: Page,
    authProviderKind: AuthProviderKind,
): Promise<void> {
    if (authProviderKind === "google") {
        throw new Error(
            "Browser confidence is not scripted for Google auth. Use local auth for automated local browser checks.",
        );
    }

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

async function waitForAssistantMessage(
    page: Page,
    matcher: RegExp,
): Promise<string> {
    const assistantMessages = page.locator('[data-testid^="message-assistant-"]');
    await assistantMessages.last().waitFor({ timeout: DEFAULT_TIMEOUT_MS });

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    for (;;) {
        const count = await assistantMessages.count();
        if (count > 0) {
            const text =
                (await assistantMessages.nth(count - 1).textContent()) ?? "";
            if (matcher.test(text)) {
                return text;
            }
        }

        if (Date.now() >= deadline) {
            break;
        }
        await page.waitForTimeout(250);
    }

    throw new Error(
        `Timed out waiting for assistant message matching ${matcher}.`,
    );
}

async function selectAgent(page: Page, agentId: string): Promise<void> {
    const agentSelect = page.getByTestId("agent-select");
    await page
        .locator(`#sidebar-agent-select option[value="${agentId}"]`)
        .waitFor({ state: "attached", timeout: DEFAULT_TIMEOUT_MS });
    await agentSelect.selectOption(agentId);
    await page.waitForTimeout(250);
}

async function startConversation(page: Page): Promise<void> {
    await page.getByTestId("new-conversation-button").click();
    await page.getByTestId("message-input").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
    const input = page.getByTestId("message-input");
    await input.fill(prompt);
    await page.getByTestId("send-message-button").click();
}

async function assertComposerSettled(page: Page): Promise<void> {
    await page.getByTestId("send-message-button").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
    invariant(
        !(await page
            .getByTestId("cancel-run-button")
            .isVisible()
            .catch(() => false)),
        "Cancel button should be hidden once the run has settled.",
    );
}

async function assertNoRecoveryBanner(page: Page): Promise<void> {
    invariant(
        !(await page
            .getByTestId("runtime-recovering-banner")
            .isVisible()
            .catch(() => false)),
        "Recovery banner should not be visible for this flow.",
    );
}

async function runSmoke(page: Page): Promise<void> {
    await selectAgent(page, "agentchat-test");
    await startConversation(page);
    await assertNoRecoveryBanner(page);
    await sendPrompt(
        page,
        "Read src/math.ts and reply with only the result of add(2, 3).",
    );
    await assertComposerSettled(page);
    const assistantText = await waitForAssistantMessage(page, /(^|[^0-9])5([^0-9]|$)/);
    invariant(
        assistantText.includes("5"),
        `Unexpected smoke response: ${JSON.stringify(assistantText)}`,
    );
    await assertNoRecoveryBanner(page);
}

async function runInterrupt(page: Page): Promise<void> {
    await selectAgent(page, "agentchat-workspace");
    await startConversation(page);
    await assertNoRecoveryBanner(page);
    await sendPrompt(
        page,
        [
            "Read notes.md but do not edit any files.",
            "Reply with a one hundred item improvement plan for that file.",
            "Keep every item to one short sentence.",
            "Return the plan in chat only.",
        ].join(" "),
    );
    await page.getByTestId("cancel-run-button").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.getByTestId("cancel-run-button").click();

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    for (;;) {
        const interruptedVisible = await page
            .getByTestId("runtime-interrupted-banner")
            .isVisible()
            .catch(() => false);
        if (interruptedVisible) {
            await assertComposerSettled(page);
            await assertNoRecoveryBanner(page);
            return;
        }

        const cancelVisible = await page
            .getByTestId("cancel-run-button")
            .isVisible()
            .catch(() => false);
        const sendVisible = await page
            .getByTestId("send-message-button")
            .isVisible()
            .catch(() => false);
        const assistantMessages = page.locator(
            '[data-testid^="message-assistant-"]',
        );
        if (!cancelVisible && sendVisible) {
            await assertComposerSettled(page);
            await assertNoRecoveryBanner(page);
            return;
        }
        const assistantCount = await assistantMessages.count();
        if (!cancelVisible && assistantCount > 0) {
            const lastText =
                (await assistantMessages
                    .nth(assistantCount - 1)
                    .textContent()) ?? "";
            if (lastText.trim().length > 0) {
                await assertComposerSettled(page);
                await assertNoRecoveryBanner(page);
                return;
            }
        }

        if (Date.now() >= deadline) {
            break;
        }
        await page.waitForTimeout(250);
    }

    throw new Error("Timed out waiting for the canceled run to settle.");
}

async function waitForRecoverySignal(page: Page): Promise<boolean> {
    const recoveringBanner = page.getByTestId("runtime-recovering-banner");
    const interruptedBanner = page.getByTestId("runtime-interrupted-banner");
    const failedBanner = page.getByTestId("runtime-failed-banner");
    const cancelButton = page.getByTestId("cancel-run-button");
    const sendButton = page.getByTestId("send-message-button");
    const assistantMessages = page.locator('[data-testid^="message-assistant-"]');

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    for (;;) {
        if (await recoveringBanner.isVisible().catch(() => false)) {
            return true;
        }
        if (await interruptedBanner.isVisible().catch(() => false)) {
            return false;
        }
        if (await failedBanner.isVisible().catch(() => false)) {
            throw new Error("Run failed after refresh.");
        }
        const cancelVisible = await cancelButton.isVisible().catch(() => false);
        const sendVisible = await sendButton.isVisible().catch(() => false);
        if (sendVisible && !cancelVisible) {
            return false;
        }
        if ((await assistantMessages.count()) > 0) {
            const lastText =
                (await assistantMessages
                    .nth((await assistantMessages.count()) - 1)
                    .textContent()) ?? "";
            if (lastText.trim().length > 0) {
                return false;
            }
        }
        if (Date.now() >= deadline) {
            break;
        }
        await page.waitForTimeout(250);
    }

    throw new Error(
        "Timed out waiting for a recovery signal after page reload.",
    );
}

async function runRefresh(page: Page): Promise<void> {
    await selectAgent(page, "agentchat-workspace");
    await startConversation(page);
    await assertNoRecoveryBanner(page);
    await sendPrompt(
        page,
        [
            "Read notes.md but do not edit any files.",
            "Reply with a two hundred item improvement plan for that file.",
            "Keep every item to one short sentence.",
            "Return the plan in chat only.",
        ].join(" "),
    );
    await page.getByTestId("cancel-run-button").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByTestId("message-input").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
    await waitForRecoverySignal(page);
    await assertComposerSettled(page);
}

async function captureScreenshot(
    page: Page,
    repoRoot: string,
    name: string,
): Promise<string> {
    const outputDir = getOutputDir(repoRoot);
    mkdirSync(outputDir, { recursive: true });
    const screenshotPath = path.join(outputDir, name);
    await page.screenshot({
        path: screenshotPath,
        fullPage: true,
    });
    return screenshotPath;
}

async function runBrowserConfidence(
    args: BrowserConfidenceArgs,
    onFailureArtifacts: (artifactPaths: string[]) => void,
): Promise<{
    artifactPaths: string[];
    authProviderKind: AuthProviderKind;
}> {
    const repoRoot = getRepoRoot();
    const authProviderKind = readAuthProviderKind(repoRoot);
    const artifactPaths: string[] = [];

    await assertWebReady(args.baseUrl);
    runConvexReset(repoRoot, authProviderKind);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(`${args.baseUrl}/chat`, { waitUntil: "domcontentloaded" });
        await signInIfNeeded(page, authProviderKind);
        await page.getByTestId("agent-select").waitFor({
            timeout: DEFAULT_TIMEOUT_MS,
        });

        if (args.mode === "smoke" || args.mode === "full") {
            await runSmoke(page);
        }
        if (args.mode === "interrupt" || args.mode === "full") {
            await runInterrupt(page);
        }
        if (args.mode === "refresh" || args.mode === "full") {
            await runRefresh(page);
        }

        artifactPaths.push(
            await captureScreenshot(
                page,
                repoRoot,
                `browser-confidence-${args.mode}.png`,
            ),
        );

        return {
            artifactPaths,
            authProviderKind,
        };
    } catch (error) {
        artifactPaths.push(
            await captureScreenshot(
                page,
                repoRoot,
                `browser-confidence-${args.mode}-failure.png`,
            ).catch(() => ""),
        );
        onFailureArtifacts(artifactPaths.filter((artifactPath) => artifactPath.length > 0));
        throw error;
    } finally {
        await browser.close();
    }
}

function writeBrowserConfidenceReport(
    args: BrowserConfidenceArgs | null,
    report:
        | ReturnType<typeof buildBrowserConfidenceSuccessReport>
        | ReturnType<typeof buildBrowserConfidenceFailureReport>,
): void {
    if (args?.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    console.log(formatBrowserConfidenceText(report));
}

const startedAtMs = Date.now();
let parsedArgs: BrowserConfidenceArgs | null = null;
let failureArtifactPaths: string[] = [];

try {
    parsedArgs = parseBrowserConfidenceArgs(process.argv.slice(2));
    const result = await runBrowserConfidence(parsedArgs, (artifactPaths) => {
        failureArtifactPaths = artifactPaths;
    });
    writeBrowserConfidenceReport(
        parsedArgs,
        buildBrowserConfidenceSuccessReport({
            args: parsedArgs,
            authProviderKind: result.authProviderKind,
            startedAtMs,
            completedAtMs: Date.now(),
            artifactPaths: result.artifactPaths.filter(
                (artifactPath) => artifactPath.length > 0,
            ),
        }),
    );
} catch (error) {
    const report = buildBrowserConfidenceFailureReport({
        args: parsedArgs,
        startedAtMs,
        completedAtMs: Date.now(),
        issueCode:
            parsedArgs === null
                ? "browser_confidence_invalid_arguments"
                : "browser_confidence_failed",
        message:
            error instanceof Error
                ? error.message
                : "Browser confidence failed.",
        artifactPaths: failureArtifactPaths,
    });
    if (parsedArgs?.json) {
        console.error(JSON.stringify(report, null, 2));
    } else {
        console.error(formatBrowserConfidenceText(report));
    }
    process.exit(1);
}
