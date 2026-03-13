import { describe, expect, it } from "bun:test";
import type { ProviderModel } from "@shared/core/models";
import type { BootstrapAgent } from "@/lib/agentchat-server";
import { buildAgentSettingsSummary } from "../settings-summary";

const agent: BootstrapAgent = {
    id: "agent-1",
    name: "Workspace Agent",
    description: "Handles the main repo.",
    avatar: null,
    tags: ["primary"],
    sortOrder: 1,
    enabled: true,
    providerIds: ["codex"],
    defaultProviderId: "codex",
    defaultModel: "codex/gpt-5",
    defaultVariant: "balanced",
};

const models: ProviderModel[] = [
    {
        id: "codex/gpt-5",
        name: "GPT-5",
        provider: "Codex",
        providerId: "codex",
        variants: [
            { id: "fast", label: "Fast" },
            { id: "balanced", label: "Balanced" },
        ],
    },
];

describe("buildAgentSettingsSummary", () => {
    it("uses selected model metadata when available", () => {
        expect(
            buildAgentSettingsSummary({
                selectedAgent: agent,
                selectedProviderId: "codex",
                selectedModelId: "codex/gpt-5",
                selectedVariantId: "balanced",
                models,
            }),
        ).toEqual({
            agentName: "Workspace Agent",
            agentDescription: "Handles the main repo.",
            providerLabel: "Codex",
            modelLabel: "GPT-5",
            variantLabel: "Balanced",
        });
    });

    it("falls back to ids and server-default labels when metadata is missing", () => {
        expect(
            buildAgentSettingsSummary({
                selectedAgent: null,
                selectedProviderId: "codex",
                selectedModelId: "codex/unknown",
                selectedVariantId: "deep",
                models: [],
            }),
        ).toEqual({
            agentName: "No agent selected",
            agentDescription: null,
            providerLabel: "codex",
            modelLabel: "codex/unknown",
            variantLabel: "deep",
        });
    });

    it("returns server defaults when nothing is selected", () => {
        expect(
            buildAgentSettingsSummary({
                selectedAgent: agent,
                selectedProviderId: null,
                selectedModelId: null,
                selectedVariantId: null,
                models,
            }),
        ).toEqual({
            agentName: "Workspace Agent",
            agentDescription: "Handles the main repo.",
            providerLabel: "Server default",
            modelLabel: "Server default",
            variantLabel: "Server default",
        });
    });
});
