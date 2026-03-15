import { describe, expect, test } from "bun:test";

import {
    buildDoctorReport,
    formatDoctorText,
    getDoctorExitCode,
} from "../doctorReport.ts";

describe("doctorReport", () => {
    test("builds a structured report and formats text output", () => {
        const report = buildDoctorReport({
            configPath: "/tmp/agentchat.config.json",
            configStatus: {
                loadedAt: Date.UTC(2026, 2, 15, 12, 0, 0),
                lastReloadAttemptAt: Date.UTC(2026, 2, 15, 12, 5, 0),
                lastReloadError: null,
            },
            diagnostics: {
                ok: true,
                auth: {
                    activeProviderKind: "local",
                    issues: [],
                },
                summary: {
                    enabledProviderCount: 1,
                    readyProviderCount: 1,
                    enabledAgentCount: 1,
                    readyAgentCount: 1,
                },
                providers: [
                    {
                        id: "codex",
                        label: "Codex",
                        enabled: true,
                        ready: true,
                        enabledModelCount: 2,
                        issues: [],
                    },
                ],
                agents: [
                    {
                        id: "agent-1",
                        name: "Agent One",
                        enabled: true,
                        ready: true,
                        availableProviderIds: ["codex"],
                        resolvedDefaultProviderId: "codex",
                        issues: [],
                    },
                ],
            },
            runtimeEnv: {
                ok: true,
                diagnostics: [
                    {
                        key: "BACKEND_TOKEN_SECRET",
                        configured: true,
                        description: "backend token secret",
                    },
                    {
                        key: "AGENTCHAT_CONVEX_SITE_URL",
                        configured: true,
                        description: "convex site url",
                    },
                    {
                        key: "RUNTIME_INGRESS_SECRET",
                        configured: true,
                        description: "runtime ingress secret",
                    },
                ],
            },
            liveProbes: new Map([
                [
                    "codex",
                    {
                        ok: true,
                        modelCount: 12,
                        error: null,
                    },
                ],
            ]),
        });

        expect(report.providers[0]?.liveProbe).toEqual({
            ok: true,
            modelCount: 12,
            error: null,
        });
        expect(report.issues).toEqual([]);
        expect(formatDoctorText(report)).toContain(
            "[provider:codex] live ok (12 models)",
        );
        expect(getDoctorExitCode(report)).toBe(0);
    });

    test("returns a failing exit code when report contains readiness failures", () => {
        const report = buildDoctorReport({
            configPath: "/tmp/agentchat.config.json",
            configStatus: {
                loadedAt: Date.UTC(2026, 2, 15, 12, 0, 0),
                lastReloadAttemptAt: null,
                lastReloadError: "bad config",
            },
            diagnostics: {
                ok: false,
                auth: {
                    activeProviderKind: null,
                    issues: ["missing auth provider"],
                },
                summary: {
                    enabledProviderCount: 1,
                    readyProviderCount: 0,
                    enabledAgentCount: 1,
                    readyAgentCount: 0,
                },
                providers: [
                    {
                        id: "codex",
                        label: "Codex",
                        enabled: true,
                        ready: false,
                        enabledModelCount: 0,
                        issues: ["Enabled provider has no enabled models."],
                    },
                ],
                agents: [
                    {
                        id: "agent-1",
                        name: "Agent One",
                        enabled: true,
                        ready: false,
                        availableProviderIds: [],
                        resolvedDefaultProviderId: null,
                        issues: ["Agent has no enabled providers."],
                    },
                ],
            },
            runtimeEnv: {
                ok: false,
                diagnostics: [
                    {
                        key: "BACKEND_TOKEN_SECRET",
                        configured: false,
                        description: "backend token secret",
                    },
                    {
                        key: "AGENTCHAT_CONVEX_SITE_URL",
                        configured: true,
                        description: "convex site url",
                    },
                    {
                        key: "RUNTIME_INGRESS_SECRET",
                        configured: true,
                        description: "runtime ingress secret",
                    },
                ],
            },
            liveProbes: new Map([
                [
                    "codex",
                    {
                        ok: false,
                        modelCount: null,
                        error: "offline",
                    },
                ],
            ]),
        });

        expect(formatDoctorText(report)).toContain(
            "[agentchat-server] config reload error: bad config",
        );
        expect(report.issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "config_reload_failed",
                    severity: "error",
                    scope: "config",
                }),
                expect.objectContaining({
                    code: "runtime_env_missing_backend_token_secret",
                    severity: "error",
                    scope: "runtimeEnv:BACKEND_TOKEN_SECRET",
                }),
                expect.objectContaining({
                    code: "provider_live_probe_failed",
                    severity: "error",
                    scope: "provider:codex",
                }),
                expect.objectContaining({
                    code: "agent_no_enabled_providers",
                    severity: "error",
                    scope: "agent:agent-1",
                }),
            ]),
        );
        expect(getDoctorExitCode(report)).toBe(1);
    });
});
