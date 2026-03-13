import { describe, expect, test } from "bun:test";
import type {
    AgentOptionsResponse,
    BootstrapAgent,
} from "@/lib/agentchat-server";
import { SupportedParameter, type ProviderModel } from "@shared/core/models";
import {
    filterModelsForProvider,
    filterModelsForAgent,
    getVariantsForModel,
    selectScopedDefaultProvider,
    selectScopedDefaultModel,
    selectScopedDefaultVariant,
} from "@/contexts/settings-helpers";

const models: ProviderModel[] = [
    {
        id: "codex/model-a",
        name: "Model A",
        providerId: "codex",
        provider: "Codex",
        supportedParameters: [SupportedParameter.Reasoning],
        variants: [
            { id: "high", label: "High" },
            { id: "low", label: "Low" },
        ],
    },
    {
        id: "other/model-b",
        name: "Model B",
        providerId: "other",
        provider: "Other",
        supportedParameters: [],
        variants: [{ id: "default", label: "Default" }],
    },
];

const selectedAgent: BootstrapAgent = {
    id: "agent-1",
    name: "Agent 1",
    description: null,
    avatar: null,
    enabled: true,
    providerIds: ["codex"],
    defaultProviderId: "codex",
    defaultModel: "codex/model-a",
    defaultVariant: "high",
    tags: [],
    sortOrder: 0,
};

const selectedAgentOptions: AgentOptionsResponse = {
    agentId: "agent-1",
    allowedProviders: [{ id: "codex", kind: "codex", label: "Codex" }],
    defaultProviderId: "codex",
    defaultModel: "codex/model-a",
    defaultVariant: "high",
    modelAllowlist: ["codex/model-a"],
    variantAllowlist: ["high"],
};

describe("settings helpers", () => {
    test("filters models to the providers exposed by the selected agent", () => {
        expect(
            filterModelsForAgent({
                models,
                selectedAgent,
                selectedAgentOptions: null,
            }).map((model) => model.id),
        ).toEqual(["codex/model-a"]);
    });

    test("applies model and variant allowlists when agent options are present", () => {
        const filteredModels = filterModelsForAgent({
            models,
            selectedAgent,
            selectedAgentOptions,
        });

        expect(filteredModels).toHaveLength(1);
        expect(filteredModels[0]?.variants).toEqual([
            { id: "high", label: "High" },
        ]);
    });

    test("prefers a stored user model when it is still allowed", () => {
        expect(
            selectScopedDefaultModel({
                models,
                userPreferredModel: "other/model-b",
                agentDefaultModel: "codex/model-a",
            }),
        ).toBe("other/model-b");
    });

    test("falls back to the agent default model when the stored preference is unavailable", () => {
        expect(
            selectScopedDefaultModel({
                models: [models[0]!],
                userPreferredModel: "other/model-b",
                agentDefaultModel: "codex/model-a",
            }),
        ).toBe("codex/model-a");
    });

    test("prefers the selected model provider for the scoped provider selection", () => {
        expect(
            selectScopedDefaultProvider({
                models,
                userPreferredProviderId: "codex",
                selectedModelId: "other/model-b",
                agentDefaultProviderId: "codex",
            }),
        ).toBe("other");
    });

    test("falls back to the agent default provider when the stored provider is unavailable", () => {
        expect(
            selectScopedDefaultProvider({
                models: [models[0]!],
                userPreferredProviderId: "other",
                selectedModelId: null,
                agentDefaultProviderId: "codex",
            }),
        ).toBe("codex");
    });

    test("filters models to the selected provider", () => {
        expect(
            filterModelsForProvider({
                models,
                providerId: "codex",
            }).map((model) => model.id),
        ).toEqual(["codex/model-a"]);
    });

    test("prefers a stored variant when it is still available", () => {
        expect(
            selectScopedDefaultVariant({
                model: models[0],
                userPreferredVariantId: "low",
                agentDefaultVariantId: "high",
            }),
        ).toBe("low");
    });

    test("falls back to the agent default variant when needed", () => {
        expect(
            selectScopedDefaultVariant({
                model: models[0],
                userPreferredVariantId: "missing",
                agentDefaultVariantId: "high",
            }),
        ).toBe("high");
    });

    test("returns model variants or an empty list", () => {
        expect(
            getVariantsForModel(models[0]).map((variant) => variant.id),
        ).toEqual(["high", "low"]);
        expect(getVariantsForModel(null)).toEqual([]);
    });
});
