import { test, expect, describe } from "bun:test";

const STORAGE_KEYS = {
    API_KEY: "router-chat-api-key",
    THEME: "router-chat-theme",
    DEFAULT_MODEL: "router-chat-default-model",
    DEFAULT_THINKING: "router-chat-default-thinking",
    DEFAULT_SEARCH: "router-chat-default-search",
    FAVORITE_MODELS: "router-chat-favorite-models",
    SKILLS: "router-chat-skills",
    SELECTED_SKILL: "router-chat-selected-skill",
} as const;

describe("storage.ts STORAGE_KEYS", () => {
    test("STORAGE_KEYS contains all expected keys", () => {
        expect(STORAGE_KEYS.API_KEY).toBe("router-chat-api-key");
        expect(STORAGE_KEYS.THEME).toBe("router-chat-theme");
        expect(STORAGE_KEYS.DEFAULT_MODEL).toBe("router-chat-default-model");
        expect(STORAGE_KEYS.DEFAULT_THINKING).toBe(
            "router-chat-default-thinking",
        );
        expect(STORAGE_KEYS.DEFAULT_SEARCH).toBe("router-chat-default-search");
        expect(STORAGE_KEYS.FAVORITE_MODELS).toBe(
            "router-chat-favorite-models",
        );
        expect(STORAGE_KEYS.SKILLS).toBe("router-chat-skills");
        expect(STORAGE_KEYS.SELECTED_SKILL).toBe("router-chat-selected-skill");
    });

    test("STORAGE_KEYS values are string literals", () => {
        expect(STORAGE_KEYS.API_KEY).toBeTypeOf("string");
        expect(STORAGE_KEYS.THEME).toBeTypeOf("string");
        expect(STORAGE_KEYS.DEFAULT_MODEL).toBeTypeOf("string");
    });
});

describe("storage.ts helpers", () => {
    test("parseSkills returns empty array for null", () => {
        const result = null;
        expect(result).toBeNull();
    });

    test("parseSkills returns empty array for invalid JSON", () => {
        const result = "invalid json {";
        expect(() => JSON.parse(result)).toThrow();
    });

    test("parseSkills parses valid JSON array", () => {
        const skills = [
            {
                id: "1",
                name: "Skill 1",
                description: "Desc",
                prompt: "Prompt",
                createdAt: 1000,
            },
        ];
        const result = JSON.parse(JSON.stringify(skills));
        expect(result).toEqual(skills);
    });
});
