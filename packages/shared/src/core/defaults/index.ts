import type { Message } from "../types";

export interface ChatDefaults {
    modelId: string;
    variantId?: string | null;
}

export interface LastUserSettings {
    modelId?: string;
    variantId?: string | null;
}

export function getLastUserSettings(
    messages: Array<
        Pick<Message, "role" | "modelId" | "variantId" | "reasoningEffort">
    >,
): LastUserSettings | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== "user") continue;
        return {
            modelId: message.modelId,
            variantId: message.variantId ?? null,
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
        variantId: supports.supportsReasoning
            ? (settings.variantId ?? null)
            : null,
    };
}
