import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "playwright";

import { trimTrailingSlash } from "./lib";

type Mode = "smoke" | "interrupt" | "refresh" | "full";

const DEFAULT_BASE_URL = "http://127.0.0.1:4040";
const DEFAULT_TIMEOUT_MS = 30_000;

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

function parseArgs(argv: string[]): { baseUrl: string; mode: Mode } {
    let baseUrl = DEFAULT_BASE_URL;
    let mode: Mode = "full";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--base-url") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--base-url requires a value.");
            }
            baseUrl = trimTrailingSlash(value);
            index += 1;
            continue;
        }

        if (arg === "--mode") {
            const value = argv[index + 1];
            if (
                value !== "smoke" &&
                value !== "interrupt" &&
                value !== "refresh" &&
                value !== "full"
            ) {
                throw new Error(
                    "--mode must be smoke, interrupt, refresh, or full.",
                );
            }
            mode = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return { baseUrl, mode };
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

function runConvexReset(repoRoot: string): void {
    const result = spawnSync(
        "bunx",
        ["convex", "run", "users:resetWorkspaceData", "{}", "--push"],
        {
            cwd: path.join(repoRoot, "packages", "convex"),
            encoding: "utf8",
        },
    );

    if (result.status !== 0) {
        const stderr = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        throw new Error(`Failed to reset workspace data: ${stderr}`);
    }
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

async function assertWorkspaceEmpty(page: Page): Promise<void> {
    await page.getByText("No conversations for this agent").waitFor({
        timeout: DEFAULT_TIMEOUT_MS,
    });
}

async function runSmoke(page: Page): Promise<void> {
    await selectAgent(page, "agentchat-test");
    await startConversation(page);
    await sendPrompt(
        page,
        "Read src/math.ts and reply with only the result of add(2, 3).",
    );
    const assistantText = await waitForAssistantMessage(page, /(^|[^0-9])5([^0-9]|$)/);
    invariant(
        assistantText.includes("5"),
        `Unexpected smoke response: ${JSON.stringify(assistantText)}`,
    );
}

async function runInterrupt(page: Page): Promise<void> {
    await selectAgent(page, "agentchat-workspace");
    await assertWorkspaceEmpty(page);
    await startConversation(page);
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
            return;
        }

        const cancelVisible = await page
            .getByTestId("cancel-run-button")
            .isVisible()
            .catch(() => false);
        const assistantMessages = page.locator(
            '[data-testid^="message-assistant-"]',
        );
        const assistantCount = await assistantMessages.count();
        if (!cancelVisible && assistantCount > 0) {
            const lastText =
                (await assistantMessages
                    .nth(assistantCount - 1)
                    .textContent()) ?? "";
            if (lastText.trim().length > 0) {
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

async function waitForRecoverySignal(page: Page): Promise<void> {
    const recoveringBanner = page.getByTestId("runtime-recovering-banner");
    const interruptedBanner = page.getByTestId("runtime-interrupted-banner");
    const failedBanner = page.getByTestId("runtime-failed-banner");
    const assistantMessages = page.locator('[data-testid^="message-assistant-"]');

    const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
    for (;;) {
        if (await recoveringBanner.isVisible().catch(() => false)) {
            return;
        }
        if (await interruptedBanner.isVisible().catch(() => false)) {
            return;
        }
        if (await failedBanner.isVisible().catch(() => false)) {
            throw new Error("Run failed after refresh.");
        }
        if ((await assistantMessages.count()) > 0) {
            const lastText =
                (await assistantMessages
                    .nth((await assistantMessages.count()) - 1)
                    .textContent()) ?? "";
            if (lastText.trim().length > 0) {
                return;
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
}

async function captureScreenshot(page: Page, repoRoot: string, name: string) {
    const outputDir = getOutputDir(repoRoot);
    mkdirSync(outputDir, { recursive: true });
    await page.screenshot({
        path: path.join(outputDir, name),
        fullPage: true,
    });
}

async function main() {
    const { baseUrl, mode } = parseArgs(process.argv.slice(2));
    const repoRoot = getRepoRoot();

    await assertWebReady(baseUrl);
    runConvexReset(repoRoot);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("agent-select").waitFor({
            timeout: DEFAULT_TIMEOUT_MS,
        });

        if (mode === "smoke" || mode === "full") {
            await runSmoke(page);
        }
        if (mode === "interrupt" || mode === "full") {
            await runInterrupt(page);
        }
        if (mode === "refresh" || mode === "full") {
            await runRefresh(page);
        }

        await captureScreenshot(
            page,
            repoRoot,
            `browser-confidence-${mode}.png`,
        );

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    mode,
                    baseUrl,
                },
                null,
                2,
            ),
        );
    } finally {
        await browser.close();
    }
}

await main();
