import { describe, expect, it } from "bun:test";
import type { Message } from "../types";
import {
    getLastUserSettings,
    resolveInitialChatSettings,
    applyModelCapabilities,
    resolveChatSettingsAgainstModels,
    type ChatDefaults,
} from "../defaults";
import { SupportedParameter, type ProviderModel } from "../models";

describe("defaults", () => {
    const models: ProviderModel[] = [
        {
            id: "default-model",
            name: "Default",
            provider: "Provider",
            supportedParameters: [SupportedParameter.Reasoning],
            variants: [
                { id: "low", label: "Low" },
                { id: "high", label: "High" },
            ],
        },
        {
            id: "fallback-model",
            name: "Fallback",
            provider: "Provider",
            supportedParameters: [],
            variants: [],
        },
    ];

    it("returns last user settings", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "variantId" | "reasoningEffort">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                variantId: "low",
                reasoningEffort: "low",
            },
            {
                role: "user",
                modelId: "m2",
                variantId: "high",
                reasoningEffort: "high",
            },
        ];

        expect(getLastUserSettings(messages)).toEqual({
            modelId: "m2",
            variantId: "high",
        });
    });

    it("returns null when no user messages", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "variantId" | "reasoningEffort">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                variantId: "low",
                reasoningEffort: "low",
            },
        ];

        expect(getLastUserSettings(messages)).toBeNull();
    });

    it("resolves initial settings from last user when available", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            variantId: "medium",
        };
        const lastUser = {
            modelId: "user-model",
            variantId: "high",
        };

        expect(
            resolveInitialChatSettings({
                messageCount: 2,
                defaults,
                lastUser,
            }),
        ).toEqual({
            modelId: "user-model",
            variantId: "high",
        });
    });

    it("falls back to defaults when last user is missing", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            variantId: "medium",
        };

        expect(
            resolveInitialChatSettings({
                messageCount: 0,
                defaults,
                lastUser: null,
            }),
        ).toEqual(defaults);
    });

    it("applies model capability constraints", () => {
        const settings: ChatDefaults = {
            modelId: "model",
            variantId: "medium",
        };

        expect(
            applyModelCapabilities(settings, {
                supportsReasoning: false,
            }),
        ).toEqual({
            modelId: "model",
            variantId: null,
        });
    });

    it("keeps current chat settings when the selected model and variant are still available", () => {
        expect(
            resolveChatSettingsAgainstModels({
                current: {
                    modelId: "default-model",
                    variantId: "high",
                },
                defaults: {
                    modelId: "fallback-model",
                    variantId: null,
                },
                models,
            }),
        ).toEqual({
            modelId: "default-model",
            variantId: "high",
        });
    });

    it("falls back to defaults when the current model is unavailable", () => {
        expect(
            resolveChatSettingsAgainstModels({
                current: {
                    modelId: "missing-model",
                    variantId: "high",
                },
                defaults: {
                    modelId: "default-model",
                    variantId: "low",
                },
                models,
            }),
        ).toEqual({
            modelId: "default-model",
            variantId: "high",
        });
    });

    it("drops the variant when the fallback model does not support reasoning", () => {
        expect(
            resolveChatSettingsAgainstModels({
                current: {
                    modelId: "missing-model",
                    variantId: "high",
                },
                defaults: {
                    modelId: "fallback-model",
                    variantId: "low",
                },
                models,
            }),
        ).toEqual({
            modelId: "fallback-model",
            variantId: null,
        });
    });
});
