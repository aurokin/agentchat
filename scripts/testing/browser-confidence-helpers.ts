import { trimTrailingSlash } from "./lib";

export type BrowserConfidenceMode =
    | "smoke"
    | "interrupt"
    | "refresh"
    | "long-stream"
    | "full";
export type BrowserConfidenceScenario = Exclude<BrowserConfidenceMode, "full">;
export type BrowserConfidenceArgs = {
    baseUrl: string;
    mode: BrowserConfidenceMode;
    json: boolean;
};
export type BrowserConfidenceSuccessReport = {
    ok: true;
    script: "browser-confidence";
    mode: BrowserConfidenceMode;
    baseUrl: string;
    authProviderKind: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    scenarios: Array<{
        name: BrowserConfidenceScenario;
        status: "passed";
    }>;
    artifactPaths: string[];
};
export type BrowserConfidenceFailureReport = {
    ok: false;
    script: "browser-confidence";
    issueCode:
        | "browser_confidence_invalid_arguments"
        | "browser_confidence_failed";
    mode: BrowserConfidenceMode | null;
    baseUrl: string | null;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    message: string;
    artifactPaths: string[];
};

const DEFAULT_BASE_URL = "http://127.0.0.1:4040";

function toIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

export function getBrowserConfidenceScenarios(
    mode: BrowserConfidenceMode,
): BrowserConfidenceSuccessReport["scenarios"] {
    if (mode === "full") {
        return [
            { name: "smoke", status: "passed" },
            { name: "interrupt", status: "passed" },
            { name: "refresh", status: "passed" },
            { name: "long-stream", status: "passed" },
        ];
    }

    return [{ name: mode, status: "passed" }];
}

export function parseBrowserConfidenceArgs(
    argv: string[],
): BrowserConfidenceArgs {
    let baseUrl = DEFAULT_BASE_URL;
    let mode: BrowserConfidenceMode = "full";
    let json = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--json") {
            json = true;
            continue;
        }

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
                value !== "long-stream" &&
                value !== "full"
            ) {
                throw new Error(
                    "--mode must be smoke, interrupt, refresh, long-stream, or full.",
                );
            }
            mode = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return { baseUrl, mode, json };
}

export function buildBrowserConfidenceSuccessReport(params: {
    args: BrowserConfidenceArgs;
    authProviderKind: string;
    startedAtMs: number;
    completedAtMs: number;
    artifactPaths: string[];
}): BrowserConfidenceSuccessReport {
    return {
        ok: true,
        script: "browser-confidence",
        mode: params.args.mode,
        baseUrl: params.args.baseUrl,
        authProviderKind: params.authProviderKind,
        startedAt: toIso(params.startedAtMs),
        completedAt: toIso(params.completedAtMs),
        durationMs: params.completedAtMs - params.startedAtMs,
        scenarios: getBrowserConfidenceScenarios(params.args.mode),
        artifactPaths: params.artifactPaths,
    };
}

export function buildBrowserConfidenceFailureReport(params: {
    args: BrowserConfidenceArgs | null;
    startedAtMs: number;
    completedAtMs: number;
    issueCode: BrowserConfidenceFailureReport["issueCode"];
    message: string;
    artifactPaths?: string[];
}): BrowserConfidenceFailureReport {
    return {
        ok: false,
        script: "browser-confidence",
        issueCode: params.issueCode,
        mode: params.args?.mode ?? null,
        baseUrl: params.args?.baseUrl ?? null,
        startedAt: toIso(params.startedAtMs),
        completedAt: toIso(params.completedAtMs),
        durationMs: params.completedAtMs - params.startedAtMs,
        message: params.message,
        artifactPaths: params.artifactPaths ?? [],
    };
}

export function formatBrowserConfidenceText(
    report: BrowserConfidenceSuccessReport | BrowserConfidenceFailureReport,
): string {
    if (!report.ok) {
        return `[browser-confidence] failed (${report.issueCode}) in ${report.durationMs}ms: ${report.message}`;
    }

    const scenarioList = report.scenarios
        .map((scenario) => scenario.name)
        .join(", ");
    const artifactSummary =
        report.artifactPaths.length > 0
            ? ` artifacts=${report.artifactPaths.join(",")}`
            : "";

    return `[browser-confidence] ok mode=${report.mode} scenarios=${scenarioList} auth=${report.authProviderKind} duration=${report.durationMs}ms${artifactSummary}`;
}
