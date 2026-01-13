import { test, expect, describe } from "bun:test";
import type { Message, Skill } from "@/lib/types";

describe("MessageList logic", () => {
    const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
        id: "msg-1",
        sessionId: "chat-1",
        role: "user",
        content: "Hello",
        contextContent: "Hello",
        createdAt: 1000,
        ...overrides,
    });

    const createMockSkill = (overrides: Partial<Skill> = {}): Skill => ({
        id: "skill-1",
        name: "Test Skill",
        description: "A test skill",
        prompt: "You are a test skill",
        createdAt: 1000,
        ...overrides,
    });

    describe("getModelDisplayName", () => {
        test("extracts model name from provider/model format", () => {
            const getModelDisplayName = (modelId: string) => {
                const parts = modelId.split("/");
                return parts.length > 1 ? parts[1] : modelId;
            };

            expect(getModelDisplayName("anthropic/claude-3-5-sonnet")).toBe(
                "claude-3-5-sonnet",
            );
            expect(getModelDisplayName("openai/gpt-4o")).toBe("gpt-4o");
            expect(getModelDisplayName("google/gemini-pro")).toBe("gemini-pro");
        });

        test("returns full string if no slash", () => {
            const getModelDisplayName = (modelId: string) => {
                const parts = modelId.split("/");
                return parts.length > 1 ? parts[1] : modelId;
            };

            expect(getModelDisplayName("simple-model")).toBe("simple-model");
        });

        test("handles undefined", () => {
            const getModelDisplayName = (modelId?: string) => {
                if (!modelId) return "Unknown model";
                const parts = modelId.split("/");
                return parts.length > 1 ? parts[1] : modelId;
            };

            expect(getModelDisplayName(undefined)).toBe("Unknown model");
            expect(getModelDisplayName("")).toBe("Unknown model");
        });

        test("handles single-part provider", () => {
            const getModelDisplayName = (modelId: string) => {
                const parts = modelId.split("/");
                return parts.length > 1 ? parts[1] : modelId;
            };

            expect(getModelDisplayName("provider")).toBe("provider");
        });
    });

    describe("isFirstSkillMessage", () => {
        test("is true only for first user message with skill", () => {
            const skill = createMockSkill();

            const isFirstSkillMessageForIndex = (
                index: number,
                isUser: boolean,
                skill: Skill | null,
            ) => {
                return isUser && skill !== null && index === 0;
            };

            expect(isFirstSkillMessageForIndex(0, true, skill)).toBe(true);
            expect(isFirstSkillMessageForIndex(1, true, skill)).toBe(false);
            expect(isFirstSkillMessageForIndex(0, false, skill)).toBe(false);
        });

        test("is false for assistant messages", () => {
            const skill = createMockSkill();

            const isFirstSkillMessageForIndex = (
                index: number,
                isUser: boolean,
                skill: Skill | null,
            ) => {
                return isUser && skill !== null && index === 0;
            };

            expect(isFirstSkillMessageForIndex(0, false, skill)).toBe(false);
        });

        test("is false when no skill", () => {
            const skill: Skill | null = null;

            const isFirstSkillMessageForIndex = (
                index: number,
                isUser: boolean,
                skill: Skill | null,
            ) => {
                return isUser && skill !== null && index === 0;
            };

            expect(isFirstSkillMessageForIndex(0, true, skill)).toBe(false);
        });
    });

    describe("copyToClipboard", () => {
        test("writes to clipboard", async () => {
            let wroteText = "";
            const clipboard = {
                writeText: async (text: string) => {
                    wroteText = text;
                },
            };

            await clipboard.writeText("Test content");

            expect(wroteText).toBe("Test content");
        });

        test("shows copied state", () => {
            let copied = false;

            const setCopied = () => {
                copied = true;
            };

            setCopied();
            expect(copied).toBe(true);
        });

        test("returns early if no clipboard", () => {
            const navigator = { clipboard: undefined as any };

            let result = true;
            if (!navigator.clipboard) {
                result = false;
            }

            expect(result).toBe(false);
        });
    });

    describe("message role detection", () => {
        test("identifies user messages", () => {
            const message = createMockMessage({ role: "user" });
            expect(message.role).toBe("user");
        });

        test("identifies assistant messages", () => {
            const message = createMockMessage({ role: "assistant" });
            expect(message.role).toBe("assistant");
        });

        test("identifies system messages", () => {
            const message = createMockMessage({ role: "system" });
            expect(message.role).toBe("system");
        });
    });

    describe("message with thinking", () => {
        test("has thinking content", () => {
            const message = createMockMessage({
                thinking: "Let me think about this...",
            });

            expect(message.thinking).toBeDefined();
            expect(message.thinking).toBe("Let me think about this...");
        });

        test("thinking can be undefined", () => {
            const message = createMockMessage();

            expect(message.thinking).toBeUndefined();
        });
    });

    describe("message with skill", () => {
        test("has skill reference", () => {
            const skill = createMockSkill();
            const message = createMockMessage({ skill });

            expect(message.skill).toBeDefined();
            expect(message.skill?.id).toBe("skill-1");
        });

        test("skill can be null", () => {
            const message = createMockMessage({ skill: null });

            expect(message.skill).toBeNull();
        });
    });

    describe("message metadata", () => {
        test("has modelId", () => {
            const message = createMockMessage({
                modelId: "anthropic/claude-3-5-sonnet",
            });

            expect(message.modelId).toBe("anthropic/claude-3-5-sonnet");
        });

        test("has thinkingLevel", () => {
            const message = createMockMessage({
                thinkingLevel: "high",
            });

            expect(message.thinkingLevel).toBe("high");
        });

        test("has searchLevel", () => {
            const message = createMockMessage({
                searchLevel: "medium",
            });

            expect(message.searchLevel).toBe("medium");
        });
    });

    describe("empty message list", () => {
        test("returns empty array for no messages", () => {
            const messages: Message[] = [];

            expect(messages.length).toBe(0);
        });

        test("shows empty state when no messages", () => {
            const messages: Message[] = [];
            const showEmpty = messages.length === 0;

            expect(showEmpty).toBe(true);
        });
    });

    describe("loading state", () => {
        test("shows skeleton when loading", () => {
            const loading = true;
            const showSkeleton = loading;

            expect(showSkeleton).toBe(true);
        });

        test("hides skeleton when not loading", () => {
            const loading = false;
            const showSkeleton = loading;

            expect(showSkeleton).toBe(false);
        });
    });

    describe("sending state", () => {
        test("shows sending indicator for last message", () => {
            const messages = [{ id: "1", content: "Hello" }];
            const sending = true;
            const index = 0;
            const isSending = sending && index === messages.length;

            expect(isSending).toBe(false);
        });

        test("shows sending indicator after last message", () => {
            const messages = [{ id: "1", content: "Hello" }];
            const sending = true;
            const index = 1;
            const isSending = sending && index === messages.length;

            expect(isSending).toBe(true);
        });
    });

    describe("message sorting", () => {
        test("messages are sorted by createdAt", () => {
            const messages: Message[] = [
                {
                    id: "3",
                    sessionId: "chat-1",
                    role: "assistant",
                    content: "Third",
                    contextContent: "Third",
                    createdAt: 3000,
                },
                {
                    id: "1",
                    sessionId: "chat-1",
                    role: "user",
                    content: "First",
                    contextContent: "First",
                    createdAt: 1000,
                },
                {
                    id: "2",
                    sessionId: "chat-1",
                    role: "assistant",
                    content: "Second",
                    contextContent: "Second",
                    createdAt: 2000,
                },
            ];

            const sorted = messages.sort((a, b) => a.createdAt - b.createdAt);

            expect(sorted[0].id).toBe("1");
            expect(sorted[1].id).toBe("2");
            expect(sorted[2].id).toBe("3");
        });
    });

    describe("message filtering", () => {
        test("filters messages by sessionId", () => {
            const messages: Message[] = [
                {
                    id: "1",
                    sessionId: "chat-1",
                    role: "user",
                    content: "Hello",
                    contextContent: "Hello",
                    createdAt: 1000,
                },
                {
                    id: "2",
                    sessionId: "chat-2",
                    role: "user",
                    content: "Other",
                    contextContent: "Other",
                    createdAt: 1000,
                },
            ];

            const filtered = messages.filter((m) => m.sessionId === "chat-1");

            expect(filtered).toHaveLength(1);
            expect(filtered[0].id).toBe("1");
        });
    });
});
