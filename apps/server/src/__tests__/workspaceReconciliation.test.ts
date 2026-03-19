import { describe, expect, test } from "bun:test";

import type { AgentConfig } from "../config.ts";
import {
    filterPersistedWorkspaceEntries,
    getCopyOnConversationAgentIds,
} from "../workspaceReconciliation.ts";

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
    return {
        id: "test-agent",
        name: "Test Agent",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: "/tmp/placeholder",
        providerIds: ["codex-main"],
        defaultProviderId: "codex-main",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
        ...overrides,
    };
}

describe("workspace reconciliation", () => {
    test("keeps all copy-on-conversation agents regardless of enabled state", () => {
        const copyAgent = makeAgent({
            id: "copy-agent",
            workspaceMode: "copy-on-conversation",
        });
        const sharedAgent = makeAgent({
            id: "shared-agent",
            workspaceMode: "shared",
        });
        const disabledCopyAgent = makeAgent({
            id: "disabled-copy-agent",
            enabled: false,
            workspaceMode: "copy-on-conversation",
        });

        expect(
            getCopyOnConversationAgentIds([
                copyAgent,
                sharedAgent,
                disabledCopyAgent,
            ]),
        ).toEqual(new Set(["copy-agent", "disabled-copy-agent"]));
    });

    test("filters persisted chat entries to copied workspaces only", () => {
        expect(
            filterPersistedWorkspaceEntries(
                [
                    {
                        agentId: "copy-agent",
                        userId: "user-1",
                        localId: "chat-1",
                    },
                    {
                        agentId: "shared-agent",
                        userId: "user-1",
                        localId: "chat-2",
                    },
                ],
                new Set(["copy-agent"]),
            ),
        ).toEqual([
            {
                agentId: "copy-agent",
                userId: "user-1",
                localId: "chat-1",
            },
        ]);
    });
});
