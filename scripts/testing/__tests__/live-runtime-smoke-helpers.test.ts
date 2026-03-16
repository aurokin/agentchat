import { describe, expect, test } from "bun:test";

import {
    buildLiveRuntimeSmokeFailureReport,
    buildLiveRuntimeSmokeSuccessReport,
    formatLiveRuntimeSmokeText,
    parseLiveRuntimeSmokeArgs,
    resolveLiveRuntimeReasoningEffort,
    selectLiveRuntimeVariantId,
} from "../live-runtime-smoke-helpers";

describe("parseLiveRuntimeSmokeArgs", () => {
    test("returns defaults when no arguments are provided", () => {
        expect(parseLiveRuntimeSmokeArgs([])).toEqual({
            mode: "smoke",
            serverUrl: "http://127.0.0.1:3030",
            email: "agentchat-live-smoke@local.agentchat",
            username: null,
            password: null,
            agentId: null,
            modelId: null,
            variantId: null,
            json: false,
        });
    });

    test("parses explicit arguments and trims the server url", () => {
        expect(
            parseLiveRuntimeSmokeArgs([
                "--mode",
                "multi-client",
                "--server-url",
                "http://192.168.50.2:3030///",
                "--email",
                "smoke@example.com",
                "--username",
                "smoke_1",
                "--password",
                "secret",
                "--agent-id",
                "agentchat-test",
                "--model-id",
                "gpt-5",
                "--variant-id",
                "high",
                "--json",
            ]),
        ).toEqual({
            mode: "multi-client",
            serverUrl: "http://192.168.50.2:3030",
            email: "smoke@example.com",
            username: "smoke_1",
            password: "secret",
            agentId: "agentchat-test",
            modelId: "gpt-5",
            variantId: "high",
            json: true,
        });
    });

    test("rejects unsupported arguments", () => {
        expect(() => parseLiveRuntimeSmokeArgs(["--broken"])).toThrow(
            "Unsupported argument: --broken",
        );
    });
});

describe("live runtime smoke reports", () => {
    test("builds a structured success report", () => {
        const report = buildLiveRuntimeSmokeSuccessReport({
            args: {
                mode: "smoke",
                serverUrl: "http://127.0.0.1:3030",
                email: "agentchat-live-smoke@local.agentchat",
                username: null,
                password: null,
                agentId: null,
                modelId: null,
                variantId: null,
                json: true,
            },
            startedAtMs: Date.UTC(2026, 2, 15, 16, 0, 0),
            completedAtMs: Date.UTC(2026, 2, 15, 16, 0, 5),
            summary: {
                finalStatus: "completed",
                runId: "run_123",
            },
        });

        expect(report).toMatchObject({
            ok: true,
            script: "live-runtime-smoke",
            mode: "smoke",
            durationMs: 5000,
            summary: {
                finalStatus: "completed",
                runId: "run_123",
            },
        });
        expect(formatLiveRuntimeSmokeText(report)).toContain("run=run_123");
    });

    test("builds a structured failure report", () => {
        const report = buildLiveRuntimeSmokeFailureReport({
            args: null,
            startedAtMs: Date.UTC(2026, 2, 15, 16, 0, 0),
            completedAtMs: Date.UTC(2026, 2, 15, 16, 0, 1),
            issueCode: "live_runtime_smoke_invalid_arguments",
            message: "Unsupported argument: --broken",
        });

        expect(report).toMatchObject({
            ok: false,
            issueCode: "live_runtime_smoke_invalid_arguments",
            mode: null,
            serverUrl: null,
            durationMs: 1000,
            failureSnapshot: null,
        });
        expect(formatLiveRuntimeSmokeText(report)).toContain(
            "live_runtime_smoke_invalid_arguments",
        );
    });
});

describe("live runtime smoke model selection", () => {
    test("prefers an explicitly requested variant", () => {
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: "balanced",
                mode: "status",
                model: {
                    variants: [{ id: "high" }, { id: "xhigh" }],
                },
                agentDefaultVariantId: "high",
            }),
        ).toBe("balanced");
    });

    test("prefers high for interrupt-style modes when available", () => {
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "interrupt",
                model: {
                    variants: [{ id: "low" }, { id: "high" }],
                },
                agentDefaultVariantId: "low",
            }),
        ).toBe("high");
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "zero-client-recover",
                model: {
                    variants: [{ id: "low" }, { id: "high" }],
                },
                agentDefaultVariantId: "low",
            }),
        ).toBe("high");
    });

    test("prefers xhigh then high for status mode", () => {
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "status",
                model: {
                    variants: [{ id: "high" }, { id: "xhigh" }],
                },
                agentDefaultVariantId: "low",
            }),
        ).toBe("xhigh");
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "status",
                model: {
                    variants: [{ id: "high" }],
                },
                agentDefaultVariantId: "low",
            }),
        ).toBe("high");
    });

    test("falls back to the agent default variant when no mode-specific variant applies", () => {
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "smoke",
                model: {
                    variants: [{ id: "low" }],
                },
                agentDefaultVariantId: "low",
            }),
        ).toBe("low");
        expect(
            selectLiveRuntimeVariantId({
                requestedVariantId: null,
                mode: "smoke",
                model: {
                    variants: [],
                },
                agentDefaultVariantId: null,
            }),
        ).toBeNull();
    });

    test("maps live runtime variants to reasoning efforts", () => {
        expect(resolveLiveRuntimeReasoningEffort("fast")).toBe("low");
        expect(resolveLiveRuntimeReasoningEffort("balanced")).toBe("medium");
        expect(resolveLiveRuntimeReasoningEffort("deep")).toBe("high");
        expect(resolveLiveRuntimeReasoningEffort("xhigh")).toBe("xhigh");
        expect(resolveLiveRuntimeReasoningEffort("custom")).toBe("medium");
        expect(resolveLiveRuntimeReasoningEffort(null)).toBe("medium");
    });
});
