const STORAGE_KEYS = {
    THEME: "agentchat-theme",
    SELECTED_AGENT: "agentchat-selected-agent",
    SELECTED_CHAT_BY_AGENT: "agentchat-selected-chat-by-agent",
} as const;

export function getTheme(): "light" | "dark" | "system" {
    if (typeof window === "undefined") return "system";
    return (
        (localStorage.getItem(STORAGE_KEYS.THEME) as
            | "light"
            | "dark"
            | "system") || "system"
    );
}

export function setTheme(theme: "light" | "dark" | "system"): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

function getStringMap(storageKey: string): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                    typeof entry[0] === "string" &&
                    typeof entry[1] === "string" &&
                    entry[0].length > 0 &&
                    entry[1].length > 0,
            ),
        );
    } catch {
        return {};
    }
}

function setStringMap(storageKey: string, value: Record<string, string>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(storageKey, JSON.stringify(value));
}

export function getSelectedAgentId(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEYS.SELECTED_AGENT);
}

export function setSelectedAgentId(agentId: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.SELECTED_AGENT, agentId);
}

export function clearSelectedAgentId(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEYS.SELECTED_AGENT);
}

function getSelectedChatMap(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.SELECTED_CHAT_BY_AGENT);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(
                (entry): entry is [string, string] =>
                    typeof entry[0] === "string" &&
                    typeof entry[1] === "string" &&
                    entry[0].length > 0 &&
                    entry[1].length > 0,
            ),
        );
    } catch {
        return {};
    }
}

function setSelectedChatMap(value: Record<string, string>): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(
        STORAGE_KEYS.SELECTED_CHAT_BY_AGENT,
        JSON.stringify(value),
    );
}

export function getSelectedChatId(agentId: string): string | null {
    if (!agentId) return null;
    return getSelectedChatMap()[agentId] ?? null;
}

export function setSelectedChatId(agentId: string, chatId: string): void {
    if (typeof window === "undefined" || !agentId || !chatId) return;
    const next = getSelectedChatMap();
    next[agentId] = chatId;
    setSelectedChatMap(next);
}

export function clearSelectedChatId(agentId: string): void {
    if (typeof window === "undefined" || !agentId) return;
    const next = getSelectedChatMap();
    delete next[agentId];
    setSelectedChatMap(next);
}
