import { describe, expect, test } from "bun:test";

import {
    SupportedParameter,
    type ProviderModel,
} from "../models";
import {
    filterModelsForAgent,
    filterModelsForProvider,
    getProviderIdForModel,
    getVariantsForModel,
    selectScopedDefaultModel,
    selectScopedDefaultProvider,
    selectScopedDefaultVariant,
} from "../settings-selection";

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

describe("settings selection", () => {
    test("filters models to the providers exposed by the selected agent", () => {
        expect(
            filterModelsForAgent({
                models,
                selectedAgent: {
                    providerIds: ["codex"],
                },
                selectedAgentOptions: null,
            }).map((model) => model.id),
        ).toEqual(["codex/model-a"]);
    });

    test("applies agent option model and variant allowlists", () => {
        expect(
            filterModelsForAgent({
                models,
                selectedAgent: {
                    providerIds: ["codex"],
                },
                selectedAgentOptions: {
                    allowedProviders: [{ id: "codex" }],
                    modelAllowlist: ["codex/model-a"],
                    variantAllowlist: ["high"],
                },
            }),
        ).toEqual([
            {
                ...models[0],
                variants: [{ id: "high", label: "High" }],
            },
        ]);
    });

    test("prefers the current model, then the agent default, then the app default, then the first model", () => {
        expect(
            selectScopedDefaultModel({
                models,
                currentModelId: "other/model-b",
                agentDefaultModel: "codex/model-a",
            }),
        ).toBe("other/model-b");
        expect(
            selectScopedDefaultModel({
                models: [models[0]!],
                currentModelId: "other/model-b",
                agentDefaultModel: "codex/model-a",
            }),
        ).toBe("codex/model-a");
        expect(
            selectScopedDefaultModel({
                models: [
                    {
                        id: "legacy",
                        name: "Legacy",
                        providerId: "codex",
                        provider: "Codex",
                    },
                    {
                        id: "gpt-5.4",
                        name: "App Default",
                        providerId: "codex",
                        provider: "Codex",
                    },
                ],
                currentModelId: null,
                agentDefaultModel: null,
            }),
        ).toBe("gpt-5.4");
    });

    test("derives provider ids and filters models to one provider", () => {
        expect(getProviderIdForModel(models[0]!)).toBe("codex");
        expect(
            getProviderIdForModel({
                id: "fallback/model",
                name: "Fallback",
                provider: "Fallback",
            }),
        ).toBe("fallback");
        expect(
            filterModelsForProvider({
                models,
                providerId: "other",
            }).map((model) => model.id),
        ).toEqual(["other/model-b"]);
    });

    test("selects provider and variant defaults within the current scope", () => {
        expect(
            selectScopedDefaultProvider({
                models,
                currentProviderId: "codex",
                selectedModelId: "other/model-b",
                agentDefaultProviderId: "codex",
            }),
        ).toBe("other");
        expect(
            selectScopedDefaultVariant({
                model: models[0],
                currentVariantId: "low",
                agentDefaultVariantId: "high",
            }),
        ).toBe("low");
        expect(
            selectScopedDefaultVariant({
                model: models[0],
                currentVariantId: "missing",
                agentDefaultVariantId: "high",
            }),
        ).toBe("high");
        expect(getVariantsForModel(models[0]).map((variant) => variant.id)).toEqual([
            "high",
            "low",
        ]);
        expect(getVariantsForModel(null)).toEqual([]);
    });
});
