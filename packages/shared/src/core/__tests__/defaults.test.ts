import { describe, expect, it } from "bun:test";
import type { Message, ThinkingLevel } from "../types";
import {
    getLastUserSettings,
    resolveInitialChatSettings,
    applyModelCapabilities,
    type ChatDefaults,
} from "../defaults";

describe("defaults", () => {
    it("returns last user settings", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "variantId" | "thinkingLevel">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                variantId: "fast",
                thinkingLevel: "low",
            },
            {
                role: "user",
                modelId: "m2",
                variantId: "deep",
                thinkingLevel: "high",
            },
        ];

        expect(getLastUserSettings(messages)).toEqual({
            modelId: "m2",
            variantId: "deep",
            thinking: "high",
        });
    });

    it("returns null when no user messages", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "variantId" | "thinkingLevel">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                variantId: "fast",
                thinkingLevel: "low",
            },
        ];

        expect(getLastUserSettings(messages)).toBeNull();
    });

    it("resolves initial settings from last user when available", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            variantId: "balanced",
            thinking: "medium",
        };
        const lastUser = {
            modelId: "user-model",
            variantId: "deep",
            thinking: "high" as ThinkingLevel,
        };

        expect(
            resolveInitialChatSettings({
                messageCount: 2,
                defaults,
                lastUser,
            }),
        ).toEqual({
            modelId: "user-model",
            variantId: "deep",
            thinking: "high",
        });
    });

    it("falls back to defaults when last user is missing", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            variantId: "balanced",
            thinking: "medium",
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
            variantId: "balanced",
            thinking: "high",
        };

        expect(
            applyModelCapabilities(settings, {
                supportsReasoning: false,
            }),
        ).toEqual({
            modelId: "model",
            variantId: "balanced",
            thinking: "none",
        });
    });
});
