export type AgentchatServerIssue = {
    title: string;
    detail: string;
};

function getErrorDetail(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }

    if (typeof error === "string" && error.trim().length > 0) {
        return error.trim();
    }

    return fallback;
}

export function toAgentchatServerIssue(params: {
    scope: "bootstrap" | "agentOptions" | "models";
    error: unknown;
}): AgentchatServerIssue {
    switch (params.scope) {
        case "bootstrap":
            return {
                title: "Failed to load the Agentchat server bootstrap.",
                detail: getErrorDetail(
                    params.error,
                    "The web app could not load agents and providers from the local Agentchat server.",
                ),
            };
        case "agentOptions":
            return {
                title: "Failed to load the selected agent options.",
                detail: getErrorDetail(
                    params.error,
                    "The selected agent's provider, model, or variant defaults could not be loaded.",
                ),
            };
        case "models":
            return {
                title: "Failed to load the provider model catalog.",
                detail: getErrorDetail(
                    params.error,
                    "The local Agentchat server did not return model or variant metadata.",
                ),
            };
    }
}
