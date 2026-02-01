import { describe, expect, it } from "bun:test";
import type { Message, ThinkingLevel, SearchLevel } from "../types";
import {
    getLastUserSettings,
    resolveInitialChatSettings,
    applyModelCapabilities,
    type ChatDefaults,
} from "../defaults";

describe("defaults", () => {
    it("returns last user settings", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "thinkingLevel" | "searchLevel">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                thinkingLevel: "low",
                searchLevel: "none",
            },
            {
                role: "user",
                modelId: "m2",
                thinkingLevel: "high",
                searchLevel: "medium",
            },
        ];

        expect(getLastUserSettings(messages)).toEqual({
            modelId: "m2",
            thinking: "high",
            searchLevel: "medium",
        });
    });

    it("returns null when no user messages", () => {
        const messages: Array<
            Pick<Message, "role" | "modelId" | "thinkingLevel" | "searchLevel">
        > = [
            {
                role: "assistant",
                modelId: "m1",
                thinkingLevel: "low",
                searchLevel: "none",
            },
        ];

        expect(getLastUserSettings(messages)).toBeNull();
    });

    it("resolves initial settings from last user when available", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            thinking: "medium",
            searchLevel: "low",
        };
        const lastUser = {
            modelId: "user-model",
            thinking: "high" as ThinkingLevel,
            searchLevel: "medium" as SearchLevel,
        };

        expect(
            resolveInitialChatSettings({
                messageCount: 2,
                defaults,
                lastUser,
            }),
        ).toEqual({
            modelId: "user-model",
            thinking: "high",
            searchLevel: "medium",
        });
    });

    it("falls back to defaults when last user is missing", () => {
        const defaults: ChatDefaults = {
            modelId: "default-model",
            thinking: "medium",
            searchLevel: "low",
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
            thinking: "high",
            searchLevel: "medium",
        };

        expect(
            applyModelCapabilities(settings, {
                supportsReasoning: false,
                supportsSearch: false,
            }),
        ).toEqual({
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
        });
    });
});
