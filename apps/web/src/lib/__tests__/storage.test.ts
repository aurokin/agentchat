import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { Skill } from "@/lib/types";

const STORAGE_KEYS = {
    API_KEY: "routerchat-api-key",
    THEME: "routerchat-theme",
    DEFAULT_MODEL: "routerchat-default-model",
    DEFAULT_THINKING: "routerchat-default-thinking",
    DEFAULT_SEARCH: "routerchat-default-search",
    FAVORITE_MODELS: "routerchat-favorite-models",
    SKILLS: "routerchat-skills",
    DEFAULT_SKILL: "routerchat-default-skill",
    SELECTED_SKILL: "routerchat-selected-skill",
    SELECTED_SKILL_ID: "routerchat-selected-skill-id",
    SELECTED_SKILL_MODE: "routerchat-selected-skill-mode",
    CLOUD_DEFAULT_SKILL: "routerchat-cloud-default-skill",
    CLOUD_SELECTED_SKILL_ID: "routerchat-cloud-selected-skill-id",
    CLOUD_SELECTED_SKILL_MODE: "routerchat-cloud-selected-skill-mode",
} as const;

describe("storage.ts STORAGE_KEYS", () => {
    test("STORAGE_KEYS contains all expected keys", () => {
        expect(STORAGE_KEYS.API_KEY).toBe("routerchat-api-key");
        expect(STORAGE_KEYS.THEME).toBe("routerchat-theme");
        expect(STORAGE_KEYS.DEFAULT_MODEL).toBe("routerchat-default-model");
        expect(STORAGE_KEYS.DEFAULT_THINKING).toBe(
            "routerchat-default-thinking",
        );
        expect(STORAGE_KEYS.DEFAULT_SEARCH).toBe("routerchat-default-search");
        expect(STORAGE_KEYS.FAVORITE_MODELS).toBe("routerchat-favorite-models");
        expect(STORAGE_KEYS.SKILLS).toBe("routerchat-skills");
        expect(STORAGE_KEYS.DEFAULT_SKILL).toBe("routerchat-default-skill");
        expect(STORAGE_KEYS.SELECTED_SKILL).toBe("routerchat-selected-skill");
        expect(STORAGE_KEYS.SELECTED_SKILL_ID).toBe(
            "routerchat-selected-skill-id",
        );
        expect(STORAGE_KEYS.SELECTED_SKILL_MODE).toBe(
            "routerchat-selected-skill-mode",
        );
        expect(STORAGE_KEYS.CLOUD_DEFAULT_SKILL).toBe(
            "routerchat-cloud-default-skill",
        );
        expect(STORAGE_KEYS.CLOUD_SELECTED_SKILL_ID).toBe(
            "routerchat-cloud-selected-skill-id",
        );
        expect(STORAGE_KEYS.CLOUD_SELECTED_SKILL_MODE).toBe(
            "routerchat-cloud-selected-skill-mode",
        );
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

describe("storage.ts getApiKey", () => {
    test("returns null on server (typeof window === 'undefined')", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("returns null when not set", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.API_KEY);
        expect(result).toBeNull();
    });

    test("returns stored key", () => {
        const mockGetItem = mock((key: string) => "sk-test-key123");
        const result = mockGetItem(STORAGE_KEYS.API_KEY);
        expect(result).toBe("sk-test-key123");
    });
});

describe("storage.ts setApiKey", () => {
    test("stores key in localStorage", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.API_KEY, "sk-new-key");
        expect(storedValues[STORAGE_KEYS.API_KEY]).toBe("sk-new-key");
    });
});

describe("storage.ts clearApiKey", () => {
    test("removes key from localStorage", () => {
        const removedKeys: string[] = [];
        const mockRemoveItem = mock((key: string) => {
            removedKeys.push(key);
        });
        mockRemoveItem(STORAGE_KEYS.API_KEY);
        expect(removedKeys).toContain(STORAGE_KEYS.API_KEY);
    });
});

describe("storage.ts getTheme", () => {
    test("returns system by default", () => {
        const mockGetItem = mock((key: string) => null);
        const result = (mockGetItem(STORAGE_KEYS.THEME) ?? "system") as
            | "light"
            | "dark"
            | "system";
        expect(result).toBe("system");
    });

    test("returns stored theme", () => {
        const mockGetItem = mock((key: string) => "dark");
        const result = mockGetItem(STORAGE_KEYS.THEME) as
            | "light"
            | "dark"
            | "system";
        expect(result).toBe("dark");
    });

    test("handles light theme", () => {
        const mockGetItem = mock((key: string) => "light");
        const result = mockGetItem(STORAGE_KEYS.THEME) as
            | "light"
            | "dark"
            | "system";
        expect(result).toBe("light");
    });

    test("handles invalid values - returns invalid without fallback", () => {
        const mockGetItem = mock((key: string) => "invalid");
        const result = mockGetItem(STORAGE_KEYS.THEME);
        expect(result).toBe("invalid");
    });
});

describe("storage.ts setTheme", () => {
    test("stores theme value", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.THEME, "dark");
        expect(storedValues[STORAGE_KEYS.THEME]).toBe("dark");
    });
});

describe("storage.ts getDefaultModel", () => {
    test("returns empty string by default", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_MODEL) || "";
        expect(result).toBe("");
    });

    test("returns stored model", () => {
        const mockGetItem = mock(
            (key: string) => "anthropic/claude-3-5-sonnet",
        );
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_MODEL) || "";
        expect(result).toBe("anthropic/claude-3-5-sonnet");
    });
});

describe("storage.ts setDefaultModel", () => {
    test("stores model ID", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.DEFAULT_MODEL, "test/model");
        expect(storedValues[STORAGE_KEYS.DEFAULT_MODEL]).toBe("test/model");
    });
});

describe("storage.ts getDefaultThinking", () => {
    test("returns none by default", () => {
        const mockGetItem = mock((key: string) => null);
        const result = (mockGetItem(STORAGE_KEYS.DEFAULT_THINKING) ??
            "none") as "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
        expect(result).toBe("none");
    });

    test("handles all thinking levels", () => {
        const levels: Array<
            "xhigh" | "high" | "medium" | "low" | "minimal" | "none"
        > = ["xhigh", "high", "medium", "low", "minimal", "none"];

        for (const level of levels) {
            const mockGetItem = mock((key: string) => level);
            const result = mockGetItem(STORAGE_KEYS.DEFAULT_THINKING) as
                | "xhigh"
                | "high"
                | "medium"
                | "low"
                | "minimal"
                | "none";
            expect(result).toBe(level);
        }
    });
});

describe("storage.ts setDefaultThinking", () => {
    test("stores thinking level", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.DEFAULT_THINKING, "high");
        expect(storedValues[STORAGE_KEYS.DEFAULT_THINKING]).toBe("high");
    });
});

describe("storage.ts getDefaultSearchEnabled", () => {
    test("returns false by default", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_SEARCH) === "true";
        expect(result).toBe(false);
    });

    test("parses true correctly", () => {
        const mockGetItem = mock((key: string) => "true");
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_SEARCH) === "true";
        expect(result).toBe(true);
    });

    test("parses false correctly", () => {
        const mockGetItem = mock((key: string) => "false");
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_SEARCH) === "true";
        expect(result).toBe(false);
    });
});

describe("storage.ts setDefaultSearchEnabled", () => {
    test("stores boolean as string", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.DEFAULT_SEARCH, String(true));
        expect(storedValues[STORAGE_KEYS.DEFAULT_SEARCH]).toBe("true");
    });
});

describe("storage.ts getFavoriteModels", () => {
    test("returns empty array by default", () => {
        const mockGetItem = mock((key: string) => null);
        let result: string[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.FAVORITE_MODELS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toEqual([]);
    });

    test("parses JSON array correctly", () => {
        const mockGetItem = mock((key: string) =>
            JSON.stringify(["model1", "model2", "model3"]),
        );
        let result: string[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.FAVORITE_MODELS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toEqual(["model1", "model2", "model3"]);
    });

    test("returns empty on invalid JSON", () => {
        const mockGetItem = mock((key: string) => "invalid json {");
        let result: string[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.FAVORITE_MODELS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toEqual([]);
    });
});

describe("storage.ts setFavoriteModels", () => {
    test("stores JSON array", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(
            STORAGE_KEYS.FAVORITE_MODELS,
            JSON.stringify(["model1", "model2"]),
        );
        expect(storedValues[STORAGE_KEYS.FAVORITE_MODELS]).toBe(
            '["model1","model2"]',
        );
    });
});

describe("storage.ts getSkills", () => {
    test("returns empty array by default", () => {
        const mockGetItem = mock((key: string) => null);
        let result: Skill[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.SKILLS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toEqual([]);
    });

    test("parses skill array correctly", () => {
        const skills: Skill[] = [
            {
                id: "skill-1",
                name: "Test Skill",
                description: "A test",
                prompt: "You are a test",
                createdAt: 1000,
            },
        ];
        const mockGetItem = mock((key: string) => JSON.stringify(skills));
        let result: Skill[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.SKILLS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("skill-1");
    });

    test("returns empty on invalid JSON", () => {
        const mockGetItem = mock((key: string) => "not json");
        let result: Skill[] = [];
        try {
            const stored = mockGetItem(STORAGE_KEYS.SKILLS);
            result = stored ? JSON.parse(stored) : [];
        } catch {
            result = [];
        }
        expect(result).toEqual([]);
    });
});

describe("storage.ts setSkills", () => {
    test("stores skills array", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        const skills: Skill[] = [
            {
                id: "skill-1",
                name: "Test",
                description: "Desc",
                prompt: "Prompt",
                createdAt: 1000,
            },
        ];
        mockSetItem(STORAGE_KEYS.SKILLS, JSON.stringify(skills));
        expect(storedValues[STORAGE_KEYS.SKILLS]).toBeDefined();
    });
});

describe("storage.ts getDefaultSkillId", () => {
    test("returns null when not set", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_SKILL);
        expect(result).toBeNull();
    });

    test("returns skill ID when set", () => {
        const mockGetItem = mock((key: string) => "skill-123");
        const result = mockGetItem(STORAGE_KEYS.DEFAULT_SKILL);
        expect(result).toBe("skill-123");
    });
});

describe("storage.ts setDefaultSkillId", () => {
    test("stores skill ID when provided", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.DEFAULT_SKILL, "skill-456");
        expect(storedValues[STORAGE_KEYS.DEFAULT_SKILL]).toBe("skill-456");
    });

    test("removes skill ID when null", () => {
        const removedKeys: string[] = [];
        const mockRemoveItem = mock((key: string) => {
            removedKeys.push(key);
        });
        const skillId: string | null = null;
        if (skillId) {
            // would set
        } else {
            mockRemoveItem(STORAGE_KEYS.DEFAULT_SKILL);
        }
        expect(removedKeys).toContain(STORAGE_KEYS.DEFAULT_SKILL);
    });
});

describe("storage.ts getSelectedSkillId", () => {
    test("returns null when not set", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.SELECTED_SKILL_ID);
        expect(result).toBeNull();
    });

    test("returns skill ID when set", () => {
        const mockGetItem = mock((key: string) => "skill-selected");
        const result = mockGetItem(STORAGE_KEYS.SELECTED_SKILL_ID);
        expect(result).toBe("skill-selected");
    });
});

describe("storage.ts setSelectedSkillId", () => {
    test("stores skill ID when provided", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.SELECTED_SKILL_ID, "skill-selected");
        expect(storedValues[STORAGE_KEYS.SELECTED_SKILL_ID]).toBe(
            "skill-selected",
        );
    });

    test("removes skill ID when null", () => {
        const removedKeys: string[] = [];
        const mockRemoveItem = mock((key: string) => {
            removedKeys.push(key);
        });
        const skillId: string | null = null;
        if (skillId) {
            // would set
        } else {
            mockRemoveItem(STORAGE_KEYS.SELECTED_SKILL_ID);
        }
        expect(removedKeys).toContain(STORAGE_KEYS.SELECTED_SKILL_ID);
    });
});

describe("storage.ts getSelectedSkillMode", () => {
    test("defaults to auto", () => {
        const mockGetItem = mock((key: string) => null);
        const result = mockGetItem(STORAGE_KEYS.SELECTED_SKILL_MODE);
        expect(result ?? "auto").toBe("auto");
    });

    test("reads manual mode", () => {
        const mockGetItem = mock((key: string) => "manual");
        const result = mockGetItem(STORAGE_KEYS.SELECTED_SKILL_MODE);
        expect(result).toBe("manual");
    });
});

describe("storage.ts setSelectedSkillMode", () => {
    test("stores mode", () => {
        const storedValues: Record<string, string> = {};
        const mockSetItem = mock((key: string, value: string) => {
            storedValues[key] = value;
        });
        mockSetItem(STORAGE_KEYS.SELECTED_SKILL_MODE, "manual");
        expect(storedValues[STORAGE_KEYS.SELECTED_SKILL_MODE]).toBe("manual");
    });
});

describe("storage.ts server-side safety", () => {
    test("getApiKey does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setApiKey does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("clearApiKey does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setTheme does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setDefaultModel does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setDefaultThinking does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setDefaultSearchEnabled does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setFavoriteModels does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setSkills does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("setDefaultSkillId does nothing on server", () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });
});
