import { describe, expect, test } from "bun:test";

import {
    getDefaultModelForAgent,
    resolveSelectedAgentId,
} from "@/contexts/agent-helpers";

const agents = [
    {
        id: "agent-a",
        name: "Agent A",
        description: null,
        avatar: null,
        enabled: true,
        providerIds: ["codex-main"],
        defaultProviderId: "codex-main",
        defaultModel: "gpt-5.3-codex",
        defaultVariant: "balanced",
        tags: [],
        sortOrder: 0,
    },
    {
        id: "agent-b",
        name: "Agent B",
        description: null,
        avatar: null,
        enabled: true,
        providerIds: ["codex-main"],
        defaultProviderId: "codex-main",
        defaultModel: null,
        defaultVariant: null,
        tags: [],
        sortOrder: 1,
    },
];

describe("agent helpers", () => {
    test("keeps stored agent selection when it still exists", () => {
        expect(
            resolveSelectedAgentId({
                agents,
                storedAgentId: "agent-b",
            }),
        ).toBe("agent-b");
    });

    test("falls back to the first visible agent when the stored selection is missing", () => {
        expect(
            resolveSelectedAgentId({
                agents,
                storedAgentId: "missing-agent",
            }),
        ).toBe("agent-a");
    });

    test("returns null when no agents are configured", () => {
        expect(
            resolveSelectedAgentId({
                agents: [],
                storedAgentId: "agent-a",
            }),
        ).toBeNull();
    });

    test("prefers the agent default model when available", () => {
        expect(
            getDefaultModelForAgent({
                agent: agents[0],
                fallbackModel: "fallback-model",
            }),
        ).toBe("gpt-5.3-codex");
    });

    test("falls back when the agent does not define a default model", () => {
        expect(
            getDefaultModelForAgent({
                agent: agents[1],
                fallbackModel: "fallback-model",
            }),
        ).toBe("fallback-model");
    });
});
