import {
    getItemAsync,
    setItemAsync,
    deleteItemAsync,
} from "./secure-store";

const SELECTED_AGENT_KEY = "agentchat-selected-agent";
const SELECTED_CHAT_BY_AGENT_KEY = "agentchat-selected-chat-by-agent";

async function getStringMap(key: string): Promise<Record<string, string>> {
    try {
        const stored = await getItemAsync(key);
        if (!stored) return {};
        const parsed = JSON.parse(stored) as unknown;
        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                    typeof entry[0] === "string" &&
                    entry[0].length > 0 &&
                    typeof entry[1] === "string" &&
                    entry[1].length > 0,
            ),
        );
    } catch {
        return {};
    }
}

async function setStringMap(
    key: string,
    value: Record<string, string>,
): Promise<void> {
    try {
        await setItemAsync(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Failed to save ${key}:`, error);
    }
}

export async function getSelectedAgentId(): Promise<string | null> {
    try {
        return await getItemAsync(SELECTED_AGENT_KEY);
    } catch {
        return null;
    }
}

export async function setSelectedAgentId(agentId: string): Promise<void> {
    try {
        await setItemAsync(SELECTED_AGENT_KEY, agentId);
    } catch (error) {
        console.error("Failed to save selected agent:", error);
    }
}

export async function clearSelectedAgentId(): Promise<void> {
    try {
        await deleteItemAsync(SELECTED_AGENT_KEY);
    } catch (error) {
        console.error("Failed to clear selected agent:", error);
    }
}

export async function getSelectedChatId(
    agentId: string,
): Promise<string | null> {
    if (!agentId) {
        return null;
    }

    const selectedChats = await getStringMap(SELECTED_CHAT_BY_AGENT_KEY);
    return selectedChats[agentId] ?? null;
}

export async function setSelectedChatId(
    agentId: string,
    chatId: string,
): Promise<void> {
    if (!agentId || !chatId) {
        return;
    }

    const selectedChats = await getStringMap(SELECTED_CHAT_BY_AGENT_KEY);
    selectedChats[agentId] = chatId;
    await setStringMap(SELECTED_CHAT_BY_AGENT_KEY, selectedChats);
}

export async function clearSelectedChatId(agentId: string): Promise<void> {
    if (!agentId) {
        return;
    }

    const selectedChats = await getStringMap(SELECTED_CHAT_BY_AGENT_KEY);
    delete selectedChats[agentId];
    await setStringMap(SELECTED_CHAT_BY_AGENT_KEY, selectedChats);
}
