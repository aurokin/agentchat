import type { Message, ThinkingLevel, SearchLevel } from "../types";

export interface ChatDefaults {
    modelId: string;
    thinking: ThinkingLevel;
    searchLevel: SearchLevel;
}

export interface LastUserSettings {
    modelId?: string;
    thinking?: ThinkingLevel;
    searchLevel?: SearchLevel;
}

export function getLastUserSettings(
    messages: Array<
        Pick<Message, "role" | "modelId" | "thinkingLevel" | "searchLevel">
    >,
): LastUserSettings | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "user") continue;
        return {
            modelId: message.modelId,
            thinking: message.thinkingLevel,
            searchLevel: message.searchLevel,
        };
    }

    return null;
}

export function resolveInitialChatSettings({
    messageCount,
    defaults,
    lastUser,
}: {
    messageCount: number;
    defaults: ChatDefaults;
    lastUser: LastUserSettings | null;
}): ChatDefaults {
    if (messageCount > 0 && lastUser) {
        return {
            modelId: lastUser.modelId ?? defaults.modelId,
            thinking: lastUser.thinking ?? defaults.thinking,
            searchLevel: lastUser.searchLevel ?? defaults.searchLevel,
        };
    }

    return defaults;
}

export function applyModelCapabilities(
    settings: ChatDefaults,
    supports: { supportsReasoning: boolean; supportsSearch: boolean },
): ChatDefaults {
    return {
        ...settings,
        thinking: supports.supportsReasoning ? settings.thinking : "none",
        searchLevel: supports.supportsSearch ? settings.searchLevel : "none",
    };
}
