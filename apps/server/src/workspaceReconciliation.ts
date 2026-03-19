import type { AgentConfig } from "./config.ts";

export type PersistedChatWorkspaceEntry = {
    agentId: string;
    userId: string;
    localId: string;
};

export function getCopyOnConversationAgentIds(
    agents: AgentConfig[],
): Set<string> {
    return new Set(
        agents
            .filter((agent) => agent.workspaceMode === "copy-on-conversation")
            .map((agent) => agent.id),
    );
}

export function filterPersistedWorkspaceEntries(
    entries: PersistedChatWorkspaceEntry[],
    copyOnConversationAgentIds: Set<string>,
): PersistedChatWorkspaceEntry[] {
    return entries.filter((entry) =>
        copyOnConversationAgentIds.has(entry.agentId),
    );
}

export function shouldSkipPersistedWorkspaceScan(params: {
    copyOnConversationAgentIds: Set<string>;
    activeWorkspaceKeys: Set<string>;
    hasManagedWorkspaces: boolean;
}): boolean {
    return (
        params.copyOnConversationAgentIds.size === 0 &&
        params.activeWorkspaceKeys.size === 0 &&
        !params.hasManagedWorkspaces
    );
}
