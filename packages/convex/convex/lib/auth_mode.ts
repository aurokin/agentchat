export type AgentchatAuthMode = "google" | "local";

export function getAgentchatAuthMode(
    env: NodeJS.ProcessEnv = process.env,
): AgentchatAuthMode {
    const value = env.AGENTCHAT_AUTH_MODE?.trim();
    if (value === "local") {
        return value;
    }
    return "google";
}

export function isAgentchatLocalAuth(
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return getAgentchatAuthMode(env) === "local";
}
