import { describe, expect, test } from "bun:test";

import {
    hasAgentDisappearedFromBootstrap,
    hasInvalidReloadError,
    hasMissingAgentRootIssue,
    hasMissingProviderCwdIssue,
    hasProviderDisappearedFromBootstrap,
    isRestoredOperatorDiagnostics,
    matchesResolvedFallbackDefaults,
    resolveOperatorAuthProviderKind,
    resolveFallbackDefaults,
    withOperatorAgentEnabled,
    withOperatorProviderEnabled,
} from "../operator-smoke-helpers";

describe("operator smoke helpers", () => {
    test("resolves fallback defaults from the first enabled provider and model", () => {
        expect(
            resolveFallbackDefaults({
                config: {
                    providers: [
                        {
                            id: "codex-main",
                            enabled: true,
                            models: [
                                {
                                    id: "gpt-5",
                                    enabled: true,
                                    variants: [
                                        { id: "fast", enabled: true },
                                        { id: "balanced", enabled: false },
                                    ],
                                },
                            ],
                        },
                        {
                            id: "codex-disabled",
                            enabled: false,
                            models: [],
                        },
                    ],
                    agents: [
                        {
                            id: "agent-1",
                            enabled: true,
                            providerIds: ["codex-main", "codex-disabled"],
                            defaultProviderId: "codex-disabled",
                            defaultModel: "missing-model",
                            defaultVariant: "missing-variant",
                        },
                    ],
                },
                agentId: "agent-1",
            }),
        ).toEqual({
            defaultProviderId: "codex-main",
            defaultModel: "gpt-5",
            defaultVariant: "fast",
        });
    });

    test("matches bootstrap disappearance predicates", () => {
        expect(
            hasAgentDisappearedFromBootstrap(
                {
                    providers: [{ id: "codex-main" }],
                    agents: [],
                },
                "agent-1",
            ),
        ).toBe(true);

        expect(
            hasProviderDisappearedFromBootstrap({
                bootstrap: {
                    providers: [],
                    agents: [],
                },
                providerId: "codex-main",
            }),
        ).toBe(true);
    });

    test("resolves the active operator auth provider kind with fallback", () => {
        expect(
            resolveOperatorAuthProviderKind({
                auth: {
                    defaultProviderId: "local-main",
                    providers: [
                        {
                            id: "local-main",
                            kind: "local",
                            enabled: false,
                        },
                        {
                            id: "google-main",
                            kind: "google",
                            enabled: true,
                        },
                    ],
                },
                providers: [],
                agents: [],
            }),
        ).toBe("google");
    });

    test("toggles enabled flags through shared config mutation helpers", () => {
        const initialConfig = {
            providers: [
                {
                    id: "codex-main",
                    enabled: true,
                    models: [],
                },
            ],
            agents: [
                {
                    id: "agent-1",
                    enabled: true,
                    providerIds: ["codex-main"],
                    defaultProviderId: "codex-main",
                },
            ],
        };

        expect(
            withOperatorAgentEnabled({
                config: initialConfig,
                agentId: "agent-1",
                enabled: false,
            }).agents[0]?.enabled,
        ).toBe(false);
        expect(
            withOperatorProviderEnabled({
                config: initialConfig,
                providerId: "codex-main",
                enabled: false,
            }).providers[0]?.enabled,
        ).toBe(false);
        expect(initialConfig.agents[0]?.enabled).toBe(true);
        expect(initialConfig.providers[0]?.enabled).toBe(true);
    });

    test("matches resolved fallback defaults exactly", () => {
        expect(
            matchesResolvedFallbackDefaults({
                options: {
                    defaultProviderId: "codex-main",
                    defaultModel: "gpt-5",
                    defaultVariant: "fast",
                },
                resolvedDefaults: {
                    defaultProviderId: "codex-main",
                    defaultModel: "gpt-5",
                    defaultVariant: "fast",
                },
            }),
        ).toBe(true);
    });

    test("detects operator diagnostics states", () => {
        const diagnostics = {
            ok: false,
            config: {
                loadedAt: 1,
                lastReloadAttemptAt: 2,
                lastReloadError: "bad config",
            },
            providers: [
                {
                    id: "codex-main",
                    issues: [
                        "Configured codex.cwd does not exist or is not a directory.",
                    ],
                },
            ],
            agents: [
                {
                    id: "agent-1",
                    issues: [
                        "Agent rootPath does not exist or is not a directory.",
                    ],
                },
            ],
        };

        expect(hasInvalidReloadError(diagnostics)).toBe(true);
        expect(
            hasMissingAgentRootIssue({
                diagnostics,
                agentId: "agent-1",
            }),
        ).toBe(true);
        expect(
            hasMissingProviderCwdIssue({
                diagnostics,
                providerId: "codex-main",
            }),
        ).toBe(true);
    });

    test("detects restored operator diagnostics state", () => {
        expect(
            isRestoredOperatorDiagnostics({
                diagnostics: {
                    ok: true,
                    config: {
                        loadedAt: 3,
                        lastReloadAttemptAt: 4,
                        lastReloadError: null,
                    },
                    providers: [
                        {
                            id: "codex-main",
                            issues: [],
                        },
                    ],
                    agents: [
                        {
                            id: "agent-1",
                            issues: [],
                        },
                    ],
                },
                agentId: "agent-1",
                providerId: "codex-main",
            }),
        ).toBe(true);
    });
});
