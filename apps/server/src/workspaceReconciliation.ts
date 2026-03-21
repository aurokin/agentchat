import type { AgentConfig } from "./config.ts";
import { getWorkspaceActiveKey } from "./workspaceManager.ts";

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
    params: {
        copyOnConversationAgentIds: Set<string>;
    },
): PersistedChatWorkspaceEntry[] {
    return entries.filter((entry) =>
        params.copyOnConversationAgentIds.has(entry.agentId),
    );
}

export function getPersistedWorkspaceActiveKeys(
    entries: PersistedChatWorkspaceEntry[],
    params: {
        copyOnConversationAgentIds: Set<string>;
        configuredAgentIds: Set<string>;
        currentCopyOnConversationSandboxRootsByAgent: Record<string, string[]>;
        currentSandboxRoots: string[];
        knownSandboxRoots: string[];
    },
): Set<string> {
    const activeKeys = new Set<string>();
    const currentSandboxRoots = new Set(params.currentSandboxRoots);
    for (const entry of entries) {
        const currentCopyOnConversationSandboxRoots =
            params.currentCopyOnConversationSandboxRootsByAgent[
                entry.agentId
            ] ?? [];
        const sandboxRoots = params.copyOnConversationAgentIds.has(
            entry.agentId,
        )
            ? currentCopyOnConversationSandboxRoots
            : params.configuredAgentIds.has(entry.agentId)
              ? currentCopyOnConversationSandboxRoots
              : params.knownSandboxRoots.filter(
                    (sandboxRoot) => !currentSandboxRoots.has(sandboxRoot),
                );
        for (const sandboxRoot of sandboxRoots) {
            activeKeys.add(
                getWorkspaceActiveKey({
                    sandboxRoot,
                    agentId: entry.agentId,
                    userId: entry.userId,
                    conversationId: entry.localId,
                }),
            );
        }
    }

    return activeKeys;
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
