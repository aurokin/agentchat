import { trimTrailingSlash } from "./lib";

export type LiveRuntimeSmokeMode =
    | "smoke"
    | "interrupt"
    | "status"
    | "zero-client"
    | "zero-client-recover"
    | "multi-client"
    | "multi-conversation"
    | "multi-agent"
    | "multi-user"
    | "stale-resume";

type LiveRuntimeSmokeVariant = {
    id: string;
};

type LiveRuntimeSmokeModel = {
    variants: LiveRuntimeSmokeVariant[];
};

export type LiveSmokeArgs = {
    mode: LiveRuntimeSmokeMode;
    serverUrl: string;
    email: string;
    username: string | null;
    password: string | null;
    agentId: string | null;
    modelId: string | null;
    variantId: string | null;
    json: boolean;
};

export type LiveRuntimeSmokeSuccessReport = {
    ok: true;
    script: "live-runtime-smoke";
    mode: LiveRuntimeSmokeMode;
    serverUrl: string;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    summary: Record<string, unknown>;
};

export type LiveRuntimeSmokeFailureReport = {
    ok: false;
    script: "live-runtime-smoke";
    issueCode:
        | "live_runtime_smoke_invalid_arguments"
        | "live_runtime_smoke_failed";
    mode: LiveRuntimeSmokeMode | null;
    serverUrl: string | null;
    startedAt: string;
    completedAt: string;
    durationMs: number;
    message: string;
    failureSnapshot: Record<string, unknown> | null;
};

const DEFAULT_SERVER_URL = "http://127.0.0.1:3030";
const DEFAULT_EMAIL = "agentchat-live-smoke@local.agentchat";

function toIso(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

export function parseLiveRuntimeSmokeArgs(argv: string[]): LiveSmokeArgs {
    let mode: LiveRuntimeSmokeMode = "smoke";
    let serverUrl = DEFAULT_SERVER_URL;
    let email = DEFAULT_EMAIL;
    let username: string | null = null;
    let password: string | null = null;
    let agentId: string | null = null;
    let modelId: string | null = null;
    let variantId: string | null = null;
    let json = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--json") {
            json = true;
            continue;
        }

        if (arg === "--mode") {
            const value = argv[index + 1];
            if (
                value !== "smoke" &&
                value !== "interrupt" &&
                value !== "status" &&
                value !== "zero-client" &&
                value !== "zero-client-recover" &&
                value !== "multi-client" &&
                value !== "multi-conversation" &&
                value !== "multi-agent" &&
                value !== "multi-user" &&
                value !== "stale-resume"
            ) {
                throw new Error(
                    "--mode must be smoke, interrupt, status, zero-client, zero-client-recover, multi-client, multi-conversation, multi-agent, multi-user, or stale-resume.",
                );
            }
            mode = value;
            index += 1;
            continue;
        }

        if (arg === "--server-url") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--server-url requires a value.");
            }
            serverUrl = value;
            index += 1;
            continue;
        }

        if (arg === "--email") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--email requires a value.");
            }
            email = value;
            index += 1;
            continue;
        }

        if (arg === "--username") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--username requires a value.");
            }
            username = value;
            index += 1;
            continue;
        }

        if (arg === "--password") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--password requires a value.");
            }
            password = value;
            index += 1;
            continue;
        }

        if (arg === "--agent-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--agent-id requires a value.");
            }
            agentId = value;
            index += 1;
            continue;
        }

        if (arg === "--model-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--model-id requires a value.");
            }
            modelId = value;
            index += 1;
            continue;
        }

        if (arg === "--variant-id") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--variant-id requires a value.");
            }
            variantId = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return {
        mode,
        serverUrl: trimTrailingSlash(serverUrl),
        email,
        username,
        password,
        agentId,
        modelId,
        variantId,
        json,
    };
}

export function selectLiveRuntimeVariantId(params: {
    requestedVariantId: string | null;
    mode: LiveRuntimeSmokeMode;
    model: LiveRuntimeSmokeModel;
    agentDefaultVariantId: string | null;
}): string | null {
    if (params.requestedVariantId !== null) {
        return params.requestedVariantId;
    }

    const variantIds = new Set(params.model.variants.map((variant) => variant.id));

    if (
        (params.mode === "interrupt" || params.mode === "zero-client-recover") &&
        variantIds.has("high")
    ) {
        return "high";
    }

    if (params.mode === "status" && variantIds.has("xhigh")) {
        return "xhigh";
    }

    if (params.mode === "status" && variantIds.has("high")) {
        return "high";
    }

    return params.agentDefaultVariantId;
}

export function resolveLiveRuntimeReasoningEffort(
    variantId: string | null,
): string {
    switch (variantId) {
        case "low":
        case "medium":
        case "high":
        case "xhigh":
        case "minimal":
        case "none":
            return variantId;
        case "fast":
            return "low";
        case "balanced":
            return "medium";
        case "deep":
            return "high";
        default:
            return "medium";
    }
}

export function buildLiveRuntimeSmokeSuccessReport(params: {
    args: LiveSmokeArgs;
    startedAtMs: number;
    completedAtMs: number;
    summary: Record<string, unknown>;
}): LiveRuntimeSmokeSuccessReport {
    return {
        ok: true,
        script: "live-runtime-smoke",
        mode: params.args.mode,
        serverUrl: params.args.serverUrl,
        startedAt: toIso(params.startedAtMs),
        completedAt: toIso(params.completedAtMs),
        durationMs: params.completedAtMs - params.startedAtMs,
        summary: params.summary,
    };
}

export function buildLiveRuntimeSmokeFailureReport(params: {
    args: LiveSmokeArgs | null;
    startedAtMs: number;
    completedAtMs: number;
    issueCode: LiveRuntimeSmokeFailureReport["issueCode"];
    message: string;
    failureSnapshot?: Record<string, unknown> | null;
}): LiveRuntimeSmokeFailureReport {
    return {
        ok: false,
        script: "live-runtime-smoke",
        issueCode: params.issueCode,
        mode: params.args?.mode ?? null,
        serverUrl: params.args?.serverUrl ?? null,
        startedAt: toIso(params.startedAtMs),
        completedAt: toIso(params.completedAtMs),
        durationMs: params.completedAtMs - params.startedAtMs,
        message: params.message,
        failureSnapshot: params.failureSnapshot ?? null,
    };
}

export function formatLiveRuntimeSmokeText(
    report: LiveRuntimeSmokeSuccessReport | LiveRuntimeSmokeFailureReport,
): string {
    if (!report.ok) {
        return `[live-runtime-smoke] failed (${report.issueCode}) in ${report.durationMs}ms: ${report.message}`;
    }

    const runId =
        typeof report.summary.runId === "string" ? report.summary.runId : null;
    const runIds = Array.isArray(report.summary.runIds)
        ? report.summary.runIds.join(",")
        : null;
    const finalStatus =
        typeof report.summary.finalStatus === "string"
            ? report.summary.finalStatus
            : Array.isArray(report.summary.finalStatuses)
              ? report.summary.finalStatuses.join(",")
              : null;

    const details = [
        `mode=${report.mode}`,
        `duration=${report.durationMs}ms`,
        finalStatus ? `status=${finalStatus}` : null,
        runId ? `run=${runId}` : null,
        runIds ? `runs=${runIds}` : null,
    ]
        .filter((value) => value !== null)
        .join(" ");

    return `[live-runtime-smoke] ok ${details}`;
}
