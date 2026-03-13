import * as SecureStore from "expo-secure-store";

const DEFAULT_PROVIDER_BY_AGENT_KEY = "agentchat-default-provider-by-agent";
const DEFAULT_MODEL_KEY = "agentchat-selected-model";
const DEFAULT_MODEL_BY_AGENT_KEY = "agentchat-default-model-by-agent";
const DEFAULT_VARIANT_BY_AGENT_KEY = "agentchat-default-variant-by-agent";
const FAVORITE_MODELS_KEY = "agentchat-favorite-models";
const SELECTED_AGENT_KEY = "agentchat-selected-agent";
const SELECTED_CHAT_BY_AGENT_KEY = "agentchat-selected-chat-by-agent";

async function getStringMap(key: string): Promise<Record<string, string>> {
    try {
        const stored = await SecureStore.getItemAsync(key);
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
        await SecureStore.setItemAsync(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Failed to save ${key}:`, error);
    }
}

export async function getDefaultModel(): Promise<string | null> {
    return await getDefaultModelForAgent(null);
}

export async function getDefaultVariantForAgent(
    agentId?: string | null,
): Promise<string | null> {
    if (!agentId) {
        return null;
    }

    try {
        const scopedVariant = (
            await getStringMap(DEFAULT_VARIANT_BY_AGENT_KEY)
        )[agentId];
        return scopedVariant ?? null;
    } catch {
        return null;
    }
}

export async function setDefaultVariantForAgent(
    value: string,
    agentId?: string | null,
): Promise<void> {
    if (!agentId) {
        return;
    }

    try {
        const scopedVariants = await getStringMap(DEFAULT_VARIANT_BY_AGENT_KEY);
        scopedVariants[agentId] = value;
        await setStringMap(DEFAULT_VARIANT_BY_AGENT_KEY, scopedVariants);
    } catch (error) {
        console.error("Failed to save default variant:", error);
    }
}

export async function getDefaultProviderForAgent(
    agentId?: string | null,
): Promise<string | null> {
    if (!agentId) {
        return null;
    }

    try {
        const scopedProvider = (
            await getStringMap(DEFAULT_PROVIDER_BY_AGENT_KEY)
        )[agentId];
        return scopedProvider ?? null;
    } catch {
        return null;
    }
}

export async function setDefaultProviderForAgent(
    value: string,
    agentId?: string | null,
): Promise<void> {
    if (!agentId) {
        return;
    }

    try {
        const scopedProviders = await getStringMap(
            DEFAULT_PROVIDER_BY_AGENT_KEY,
        );
        scopedProviders[agentId] = value;
        await setStringMap(DEFAULT_PROVIDER_BY_AGENT_KEY, scopedProviders);
    } catch (error) {
        console.error("Failed to save default provider:", error);
    }
}

export async function getDefaultModelForAgent(
    agentId?: string | null,
): Promise<string | null> {
    try {
        if (agentId) {
            const scopedModel = (
                await getStringMap(DEFAULT_MODEL_BY_AGENT_KEY)
            )[agentId];
            if (scopedModel) {
                return scopedModel;
            }
        }

        return await SecureStore.getItemAsync(DEFAULT_MODEL_KEY);
    } catch {
        return null;
    }
}

export async function setDefaultModel(value: string): Promise<void> {
    await setDefaultModelForAgent(value, null);
}

export async function setDefaultModelForAgent(
    value: string,
    agentId?: string | null,
): Promise<void> {
    try {
        if (agentId) {
            const scopedModels = await getStringMap(DEFAULT_MODEL_BY_AGENT_KEY);
            scopedModels[agentId] = value;
            await setStringMap(DEFAULT_MODEL_BY_AGENT_KEY, scopedModels);
            return;
        }

        await SecureStore.setItemAsync(DEFAULT_MODEL_KEY, value);
    } catch (error) {
        console.error("Failed to save default model:", error);
    }
}

export async function getFavoriteModels(): Promise<string[]> {
    try {
        const stored = await SecureStore.getItemAsync(FAVORITE_MODELS_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((modelId) => typeof modelId === "string");
    } catch {
        return [];
    }
}

export async function setFavoriteModels(models: string[]): Promise<void> {
    try {
        await SecureStore.setItemAsync(
            FAVORITE_MODELS_KEY,
            JSON.stringify(models),
        );
    } catch (error) {
        console.error("Failed to save favorite models:", error);
    }
}

export async function getSelectedAgentId(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(SELECTED_AGENT_KEY);
    } catch {
        return null;
    }
}

export async function setSelectedAgentId(agentId: string): Promise<void> {
    try {
        await SecureStore.setItemAsync(SELECTED_AGENT_KEY, agentId);
    } catch (error) {
        console.error("Failed to save selected agent:", error);
    }
}

export async function clearSelectedAgentId(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(SELECTED_AGENT_KEY);
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
