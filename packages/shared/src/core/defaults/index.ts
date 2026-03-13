import type { Message, ThinkingLevel } from "../types";

export interface ChatDefaults {
    modelId: string;
    variantId?: string | null;
    thinking: ThinkingLevel;
}

export interface LastUserSettings {
    modelId?: string;
    variantId?: string | null;
    thinking?: ThinkingLevel;
}

export function getLastUserSettings(
    messages: Array<
        Pick<Message, "role" | "modelId" | "variantId" | "thinkingLevel">
    >,
): LastUserSettings | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "user") continue;
        return {
            modelId: message.modelId,
            variantId: message.variantId ?? null,
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
            variantId: lastUser.variantId ?? defaults.variantId ?? null,
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
