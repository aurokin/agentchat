import { describe, expect, test } from "bun:test";
import type { OpenRouterModel } from "@shared/core/models";
import {
    filterModels,
    splitFavoriteModels,
    groupModelsByProvider,
    getProviderOrder,
} from "@/components/chat/model-selector-utils";

describe("ModelSelector logic (mobile)", () => {
    const mockModels: OpenRouterModel[] = [
        {
            id: "anthropic/claude-3-5-sonnet",
            name: "claude-3-5-sonnet",
            provider: "Anthropic",
        },
        {
            id: "anthropic/claude-3-haiku",
            name: "claude-3-haiku",
            provider: "Anthropic",
        },
        { id: "openai/gpt-4o", name: "gpt-4o", provider: "OpenAI" },
        { id: "openai/gpt-4o-mini", name: "gpt-4o-mini", provider: "OpenAI" },
        { id: "google/gemini-pro", name: "gemini-pro", provider: "Google" },
        { id: "meta/llama-3-70b", name: "llama-3-70b", provider: "Meta" },
        { id: "favorites/model-1", name: "model-1", provider: "Favorite" },
        { id: "favorites/model-2", name: "model-2", provider: "Favorite" },
    ];

    const favoriteModels = ["favorites/model-1", "favorites/model-2"];

    describe("filterModels", () => {
        test("returns all models when no query", () => {
            const filtered = filterModels(mockModels, "");
            expect(filtered).toHaveLength(8);
        });

        test("filters by id", () => {
            const filtered = filterModels(mockModels, "claude");
            expect(filtered).toHaveLength(2);
            expect(filtered[0].id).toContain("claude");
        });

        test("filters by name", () => {
            const filtered = filterModels(mockModels, "gpt-4o");
            expect(filtered).toHaveLength(2);
            expect(filtered.every((m) => m.name.includes("gpt-4o"))).toBe(true);
        });

        test("filters by provider", () => {
            const filtered = filterModels(mockModels, "anthropic");
            expect(filtered).toHaveLength(2);
            expect(filtered.every((m) => m.provider === "Anthropic")).toBe(
                true,
            );
        });

        test("is case insensitive", () => {
            const filtered = filterModels(mockModels, "CLAUDE");
            expect(filtered).toHaveLength(2);
        });

        test("returns empty for no matches", () => {
            const filtered = filterModels(mockModels, "nonexistent-model-xyz");
            expect(filtered).toHaveLength(0);
        });
    });

    describe("splitFavoriteModels", () => {
        test("contains only favorites", () => {
            const { favoriteModelList } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            expect(favoriteModelList).toHaveLength(2);
            expect(
                favoriteModelList.every((m) => favoriteModels.includes(m.id)),
            ).toBe(true);
        });

        test("sorts alphabetically by name", () => {
            const { favoriteModelList } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            expect(favoriteModelList[0].name).toBe("model-1");
            expect(favoriteModelList[1].name).toBe("model-2");
        });

        test("excludes favorites from other models", () => {
            const { otherModels } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            expect(otherModels).toHaveLength(6);
            expect(
                otherModels.every((m) => !favoriteModels.includes(m.id)),
            ).toBe(true);
        });
    });

    describe("groupModelsByProvider", () => {
        test("groups by provider from id", () => {
            const { otherModels } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            const grouped = groupModelsByProvider(otherModels);
            expect(Object.keys(grouped)).toEqual([
                "anthropic",
                "openai",
                "google",
                "meta",
            ]);
        });

        test("groups have correct models", () => {
            const { otherModels } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            const grouped = groupModelsByProvider(otherModels);
            expect(grouped.anthropic).toHaveLength(2);
            expect(grouped.openai).toHaveLength(2);
            expect(grouped.google).toHaveLength(1);
            expect(grouped.meta).toHaveLength(1);
        });

        test("handles model without provider prefix", () => {
            const modelsWithNoProvider: OpenRouterModel[] = [
                {
                    id: "no-slash-model",
                    name: "no-slash-model",
                    provider: "Unknown",
                },
            ];

            const grouped = groupModelsByProvider(modelsWithNoProvider);
            expect(grouped.other).toBeDefined();
            expect(grouped.other).toHaveLength(1);
        });
    });

    describe("getProviderOrder", () => {
        test("returns providers in first-occurrence order", () => {
            const { otherModels } = splitFavoriteModels(
                mockModels,
                favoriteModels,
            );
            const order = getProviderOrder(otherModels);
            expect(order).toEqual(["anthropic", "openai", "google", "meta"]);
        });

        test("deduplicates providers", () => {
            const order = getProviderOrder([
                { id: "openai/gpt-4o", name: "gpt-4o", provider: "OpenAI" },
                {
                    id: "openai/gpt-4o-mini",
                    name: "gpt-4o-mini",
                    provider: "OpenAI",
                },
                {
                    id: "anthropic/claude",
                    name: "claude",
                    provider: "Anthropic",
                },
            ]);
            expect(order).toEqual(["openai", "anthropic"]);
        });
    });
});
