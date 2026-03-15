import {
    APP_DEFAULT_MODEL,
    modelSupportsReasoning,
    type ProviderModel,
} from "../models";
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
        if (!message) {
            continue;
        }
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

export function resolveChatSettingsAgainstModels(params: {
    current: ChatDefaults;
    defaults: ChatDefaults;
    models: ProviderModel[];
}): ChatDefaults {
    const availableModels = params.models;
    const resolvedModel =
        availableModels.find((model) => model.id === params.current.modelId) ??
        availableModels.find((model) => model.id === params.defaults.modelId) ??
        availableModels.find((model) => model.id === APP_DEFAULT_MODEL) ??
        availableModels[0];

    if (!resolvedModel) {
        return {
            modelId: params.current.modelId || params.defaults.modelId,
            variantId:
                params.current.variantId ?? params.defaults.variantId ?? null,
        };
    }

    const variantIds =
        resolvedModel.variants?.map((variant) => variant.id) ?? [];
    const desiredVariantId =
        params.current.variantId ?? params.defaults.variantId ?? null;

    return applyModelCapabilities(
        {
            modelId: resolvedModel.id,
            variantId:
                variantIds.length === 0
                    ? null
                    : desiredVariantId && variantIds.includes(desiredVariantId)
                      ? desiredVariantId
                      : params.defaults.variantId &&
                          variantIds.includes(params.defaults.variantId)
                        ? params.defaults.variantId
                        : (resolvedModel.variants?.[0]?.id ?? null),
        },
        {
            supportsReasoning: modelSupportsReasoning(resolvedModel),
        },
    );
}
