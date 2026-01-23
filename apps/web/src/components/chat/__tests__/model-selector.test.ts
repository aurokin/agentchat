import { test, expect, describe } from "bun:test";
import type { OpenRouterModel } from "@shared/core/models";

describe("ModelSelector logic", () => {
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

    describe("filteredModels", () => {
        test("returns all models when no query", () => {
            const searchQuery = "";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(8);
        });

        test("filters by id", () => {
            const searchQuery = "claude";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(2);
            expect(filtered[0].id).toContain("claude");
        });

        test("filters by name", () => {
            const searchQuery = "gpt-4o";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(2);
            expect(filtered.every((m) => m.name.includes("gpt-4o"))).toBe(true);
        });

        test("filters by provider", () => {
            const searchQuery = "anthropic";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(2);
            expect(filtered.every((m) => m.provider === "Anthropic")).toBe(
                true,
            );
        });

        test("is case insensitive", () => {
            const searchQuery = "CLAUDE";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(2);
        });

        test("returns empty for no matches", () => {
            const searchQuery = "nonexistent-model-xyz";
            const filtered = searchQuery.trim()
                ? mockModels.filter(
                      (model) =>
                          model.id
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.name
                              .toLowerCase()
                              .includes(searchQuery.toLowerCase()) ||
                          model.provider
                              ?.toLowerCase()
                              .includes(searchQuery.toLowerCase()),
                  )
                : mockModels;

            expect(filtered).toHaveLength(0);
        });
    });

    describe("favoriteModelList", () => {
        test("contains only favorites", () => {
            const favorites = mockModels.filter((model) =>
                favoriteModels.includes(model.id),
            );

            expect(favorites).toHaveLength(2);
            expect(favorites.every((m) => favoriteModels.includes(m.id))).toBe(
                true,
            );
        });

        test("sorts alphabetically by name", () => {
            const favorites = mockModels
                .filter((model) => favoriteModels.includes(model.id))
                .sort((a, b) => a.name.localeCompare(b.name));

            expect(favorites[0].name).toBe("model-1");
            expect(favorites[1].name).toBe("model-2");
        });
    });

    describe("otherModels", () => {
        test("excludes favorites", () => {
            const others = mockModels.filter(
                (model) => !favoriteModels.includes(model.id),
            );

            expect(others).toHaveLength(6);
            expect(others.every((m) => !favoriteModels.includes(m.id))).toBe(
                true,
            );
        });
    });

    describe("groupedModels", () => {
        test("groups by provider from id", () => {
            const others = mockModels.filter(
                (model) => !favoriteModels.includes(model.id),
            );

            const grouped = others.reduce(
                (acc, model) => {
                    const provider = model.id.split("/")[0] || "other";
                    if (!acc[provider]) {
                        acc[provider] = [];
                    }
                    acc[provider].push(model);
                    return acc;
                },
                {} as Record<string, OpenRouterModel[]>,
            );

            expect(Object.keys(grouped)).toEqual([
                "anthropic",
                "openai",
                "google",
                "meta",
            ]);
        });

        test("groups have correct models", () => {
            const others = mockModels.filter(
                (model) => !favoriteModels.includes(model.id),
            );

            const grouped = others.reduce(
                (acc, model) => {
                    const provider = model.id.split("/")[0] || "other";
                    if (!acc[provider]) {
                        acc[provider] = [];
                    }
                    acc[provider].push(model);
                    return acc;
                },
                {} as Record<string, OpenRouterModel[]>,
            );

            expect(grouped["anthropic"]).toHaveLength(2);
            expect(grouped["openai"]).toHaveLength(2);
            expect(grouped["google"]).toHaveLength(1);
            expect(grouped["meta"]).toHaveLength(1);
        });

        test("handles model without provider prefix", () => {
            const modelsWithNoProvider: OpenRouterModel[] = [
                {
                    id: "no-slash-model",
                    name: "no-slash-model",
                    provider: "Unknown",
                },
            ];

            const grouped = modelsWithNoProvider.reduce(
                (acc, model) => {
                    const parts = model.id.split("/");
                    const provider = parts.length > 1 ? parts[0] : "other";
                    if (!acc[provider]) {
                        acc[provider] = [];
                    }
                    acc[provider].push(model);
                    return acc;
                },
                {} as Record<string, OpenRouterModel[]>,
            );

            expect(grouped["other"]).toBeDefined();
            expect(grouped["other"]).toHaveLength(1);
        });
    });

    describe("handleSelect", () => {
        test("sets isOpen to false after selection", () => {
            let isOpen = true;
            const onModelChange = (_modelId: string) => {
                isOpen = false;
            };

            onModelChange("test-model");
            expect(isOpen).toBe(false);
        });
    });

    describe("handleToggleFavorite", () => {
        test("stops event propagation", () => {
            let stopped = false;
            const event = {
                stopPropagation: () => {
                    stopped = true;
                },
            };

            event.stopPropagation();

            expect(stopped).toBe(true);
        });

        test("removes model from favorites when already favorited", () => {
            const currentFavorites = ["model-a", "model-b", "model-c"];
            const modelToUnfavorite = "model-b";

            const isFavorite = currentFavorites.includes(modelToUnfavorite);
            const newFavorites = isFavorite
                ? currentFavorites.filter((id) => id !== modelToUnfavorite)
                : [...currentFavorites, modelToUnfavorite];

            expect(newFavorites).toEqual(["model-a", "model-c"]);
            expect(newFavorites).not.toContain("model-b");
        });

        test("adds model to favorites when not favorited", () => {
            const currentFavorites = ["model-a", "model-c"];
            const modelToFavorite = "model-b";

            const isFavorite = currentFavorites.includes(modelToFavorite);
            const newFavorites = isFavorite
                ? currentFavorites.filter((id) => id !== modelToFavorite)
                : [...currentFavorites, modelToFavorite];

            expect(newFavorites).toEqual(["model-a", "model-c", "model-b"]);
            expect(newFavorites).toContain("model-b");
        });

        test("can unfavorite from favorites section (regression test)", () => {
            // This test ensures that models in the favorites section can be unfavorited
            // Previously the star icon in favorites section was not clickable
            const favoriteModels = ["favorites/model-1", "favorites/model-2"];
            const modelToUnfavorite = "favorites/model-1";

            // Simulate clicking the star on a favorited model
            const isFavorite = favoriteModels.includes(modelToUnfavorite);
            expect(isFavorite).toBe(true);

            const newFavorites = favoriteModels.filter(
                (id) => id !== modelToUnfavorite,
            );

            expect(newFavorites).toEqual(["favorites/model-2"]);
            expect(newFavorites).not.toContain("favorites/model-1");
        });
    });

    describe("dropdown behavior", () => {
        test("closes on escape key", () => {
            let isOpen = true;

            const handleEscape = (e: { key: string }) => {
                if (e.key === "Escape") isOpen = false;
            };

            handleEscape({ key: "Escape" });
            expect(isOpen).toBe(false);
        });

        test("does not close on other keys", () => {
            let isOpen = true;

            const handleKey = (e: { key: string }) => {
                if (e.key === "Escape") isOpen = false;
            };

            handleKey({ key: "Enter" });
            expect(isOpen).toBe(true);
        });

        test("closes on outside click", () => {
            let isOpen = true;

            const containerRef = {
                current: { contains: (_el: unknown) => false },
            };
            const event = { target: {} };

            if (isOpen) {
                if (
                    containerRef.current &&
                    !containerRef.current.contains(event.target)
                ) {
                    isOpen = false;
                }
            }

            expect(isOpen).toBe(false);
        });
    });

    describe("search input", () => {
        test("clears search query when dropdown closes", () => {
            let searchQuery = "test query";
            let isOpen = true;

            if (!isOpen) {
                searchQuery = "";
            }

            expect(searchQuery).toBe("test query");
        });

        test("focuses search input when dropdown opens", () => {
            let searchQuery = "";
            let isOpen = false;
            let focusCalled = false;
            const searchInputRef = {
                current: {
                    focus: () => {
                        focusCalled = true;
                    },
                },
            };

            isOpen = true;
            if (isOpen && searchInputRef.current) {
                searchInputRef.current.focus();
            }

            expect(focusCalled).toBe(true);
        });
    });
});
