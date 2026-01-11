export type ConversationActionMode = "mobile" | "desktop";

interface ConversationActionModeInput {
    isMobile: boolean;
    isDesktop: boolean;
}

export function getConversationActionMode({
    isMobile,
    isDesktop,
}: ConversationActionModeInput): ConversationActionMode {
    if (isMobile) {
        return "mobile";
    }

    if (isDesktop) {
        return "desktop";
    }

    return "mobile";
}
