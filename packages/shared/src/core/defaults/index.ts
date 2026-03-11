import type { Message, ThinkingLevel } from "../types";

export interface ChatDefaults {
    modelId: string;
    thinking: ThinkingLevel;
}

export interface LastUserSettings {
    modelId?: string;
    thinking?: ThinkingLevel;
}

export function getLastUserSettings(
    messages: Array<Pick<Message, "role" | "modelId" | "thinkingLevel">>,
): LastUserSettings | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "user") continue;
        return {
            modelId: message.modelId,
            thinking: message.thinkingLevel,
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
        };
    }

    return defaults;
}

export function applyModelCapabilities(
    settings: ChatDefaults,
    supports: { supportsReasoning: boolean },
): ChatDefaults {
    return {
        ...settings,
        thinking: supports.supportsReasoning ? settings.thinking : "none",
    };
}
