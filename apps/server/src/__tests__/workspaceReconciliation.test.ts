import { describe, expect, test } from "bun:test";

import type { AgentConfig } from "../config.ts";
import { getWorkspaceActiveKey } from "../workspaceManager.ts";
import {
    filterPersistedWorkspaceEntries,
    getCopyOnConversationAgentIds,
    shouldSkipPersistedWorkspaceScan,
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

    test("keeps copied workspaces and preserves entries for missing agents", () => {
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
                    {
                        agentId: "missing-agent",
                        userId: "user-1",
                        localId: "chat-3",
                    },
                ],
                {
                    copyOnConversationAgentIds: new Set(["copy-agent"]),
                    configuredAgentIds: new Set(["copy-agent", "shared-agent"]),
                },
            ),
        ).toEqual([
            {
                agentId: "copy-agent",
                userId: "user-1",
                localId: "chat-1",
            },
            {
                agentId: "missing-agent",
                userId: "user-1",
                localId: "chat-3",
            },
        ]);
    });

    test("skips the persisted workspace scan only when copied workspaces are unused", () => {
        expect(
            shouldSkipPersistedWorkspaceScan({
                copyOnConversationAgentIds: new Set(),
                activeWorkspaceKeys: new Set(),
                hasManagedWorkspaces: false,
            }),
        ).toBe(true);

        expect(
            shouldSkipPersistedWorkspaceScan({
                copyOnConversationAgentIds: new Set(["copy-agent"]),
                activeWorkspaceKeys: new Set(),
                hasManagedWorkspaces: false,
            }),
        ).toBe(false);

        expect(
            shouldSkipPersistedWorkspaceScan({
                copyOnConversationAgentIds: new Set(),
                activeWorkspaceKeys: new Set([
                    getWorkspaceActiveKey({
                        sandboxRoot: "/tmp/sandbox",
                        agentId: "copy-agent",
                        userId: "user-1",
                        conversationId: "chat-1",
                    }),
                ]),
                hasManagedWorkspaces: false,
            }),
        ).toBe(false);

        expect(
            shouldSkipPersistedWorkspaceScan({
                copyOnConversationAgentIds: new Set(),
                activeWorkspaceKeys: new Set(),
                hasManagedWorkspaces: true,
            }),
        ).toBe(false);
    });
});
