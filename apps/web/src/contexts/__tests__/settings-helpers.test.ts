import { describe, expect, test } from "bun:test";

import {
    filterModelsForAgent,
    selectScopedDefaultModel,
} from "@/contexts/settings-helpers";
import type { OpenRouterModel } from "@/lib/types";

const models: OpenRouterModel[] = [
    {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        providerId: "codex-main",
        provider: "Codex Main",
        variants: [
            { id: "fast", label: "Fast" },
            { id: "balanced", label: "Balanced" },
        ],
    },
    {
        id: "codex-mini",
        name: "Codex Mini",
        providerId: "codex-mini",
        provider: "Codex Mini",
        variants: [{ id: "fast", label: "Fast" }],
    },
];

const selectedAgent = {
    id: "agent-a",
    name: "Agent A",
    description: null,
    avatar: null,
    enabled: true,
    providerIds: ["codex-main"],
    defaultProviderId: "codex-main",
    defaultModel: "gpt-5.3-codex",
    defaultVariant: "balanced",
    tags: [],
    sortOrder: 0,
};

describe("settings helpers", () => {
    test("filters models to the providers exposed by the selected agent", () => {
        expect(
            filterModelsForAgent({
                models,
                selectedAgent,
                selectedAgentOptions: null,
            }).map((model) => model.id),
        ).toEqual(["gpt-5.3-codex"]);
    });

    test("applies model and variant allowlists when agent options are present", () => {
        expect(
            filterModelsForAgent({
                models,
                selectedAgent,
                selectedAgentOptions: {
                    agentId: "agent-a",
                    allowedProviders: [
                        {
                            id: "codex-main",
                            kind: "codex",
                            label: "Codex Main",
                        },
                    ],
                    defaultProviderId: "codex-main",
                    defaultModel: "gpt-5.3-codex",
                    defaultVariant: "balanced",
                    modelAllowlist: ["gpt-5.3-codex"],
                    variantAllowlist: ["balanced"],
                },
            })[0]?.variants,
        ).toEqual([{ id: "balanced", label: "Balanced" }]);
    });

    test("prefers a stored user model when it is still allowed", () => {
        expect(
            selectScopedDefaultModel({
                models,
                userPreferredModel: "gpt-5.3-codex",
                agentDefaultModel: "codex-mini",
            }),
        ).toBe("gpt-5.3-codex");
    });

    test("falls back to the agent default model when the stored preference is unavailable", () => {
        expect(
            selectScopedDefaultModel({
                models: filterModelsForAgent({
                    models,
                    selectedAgent,
                    selectedAgentOptions: null,
                }),
                userPreferredModel: "codex-mini",
                agentDefaultModel: "gpt-5.3-codex",
            }),
        ).toBe("gpt-5.3-codex");
    });
});
