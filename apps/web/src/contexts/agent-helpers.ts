import type { BootstrapAgent } from "@/lib/agentchat-server";

export function resolveSelectedAgentId(params: {
    agents: BootstrapAgent[];
    storedAgentId: string | null;
}): string | null {
    const { agents, storedAgentId } = params;
    if (agents.length === 0) {
        return null;
    }

    if (storedAgentId && agents.some((agent) => agent.id === storedAgentId)) {
        return storedAgentId;
    }

    return agents[0]?.id ?? null;
}

export function getDefaultModelForAgent(params: {
    agent: BootstrapAgent | null;
    fallbackModel: string;
}): string {
    const { agent, fallbackModel } = params;
    return agent?.defaultModel ?? fallbackModel;
}
