export type AgentchatAuthMode = "google" | "disabled";

const DEFAULT_DISABLED_USER_EMAIL = "default@local.agentchat";
const DEFAULT_DISABLED_USER_NAME = "Default User";
const DEFAULT_DISABLED_USER_SUBJECT = "agentchat-default-user";

export function getAgentchatAuthMode(
    env: NodeJS.ProcessEnv = process.env,
): AgentchatAuthMode {
    return env.AGENTCHAT_AUTH_MODE?.trim() === "disabled"
        ? "disabled"
        : "google";
}

export function isAgentchatAuthDisabled(
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return getAgentchatAuthMode(env) === "disabled";
}

export function getDisabledUserProfile(env: NodeJS.ProcessEnv = process.env): {
    email: string;
    name: string;
    subject: string;
} {
    return {
        email:
            env.AGENTCHAT_DEFAULT_USER_EMAIL?.trim() ||
            DEFAULT_DISABLED_USER_EMAIL,
        name:
            env.AGENTCHAT_DEFAULT_USER_NAME?.trim() ||
            DEFAULT_DISABLED_USER_NAME,
        subject:
            env.AGENTCHAT_DEFAULT_USER_SUBJECT?.trim() ||
            DEFAULT_DISABLED_USER_SUBJECT,
    };
}
