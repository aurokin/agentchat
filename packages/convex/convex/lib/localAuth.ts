const LOCAL_USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,30})$/;
const LOCAL_EMAIL_DOMAIN = "local.agentchat";

export function normalizeLocalUsername(input: string): string {
    const username = input.trim().toLowerCase();
    if (!LOCAL_USERNAME_PATTERN.test(username)) {
        throw new Error(
            "Local usernames must be 2-31 chars using lowercase letters, numbers, underscores, or hyphens.",
        );
    }
    return username;
}

export function localUsernameToEmail(username: string): string {
    return `${normalizeLocalUsername(username)}@${LOCAL_EMAIL_DOMAIN}`;
}

export function normalizeLocalDisplayName(
    displayName: string | null | undefined,
    username: string,
): string {
    const trimmed = displayName?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : username;
}
