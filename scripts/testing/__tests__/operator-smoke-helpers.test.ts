import { describe, expect, test } from "bun:test";

import {
    hasAgentDisappearedFromBootstrap,
    hasInvalidReloadError,
    hasMissingAgentRootIssue,
    hasMissingProviderCwdIssue,
    hasProviderDisappearedFromBootstrap,
    isRestoredOperatorDiagnostics,
    matchesResolvedFallbackDefaults,
    resolveFallbackDefaults,
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
