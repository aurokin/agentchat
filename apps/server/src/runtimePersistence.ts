type RuntimeEventPayload = Record<string, unknown>;

export type PersistedRuntimeBinding = {
    provider: string;
    status: "idle" | "active" | "expired" | "errored";
    providerThreadId: string | null;
    providerResumeToken: string | null;
    activeRunId: string | null;
    lastError: string | null;
    lastEventAt: number | null;
    expiresAt: number | null;
    workspaceMode?: "shared" | "copy-on-conversation";
    workspaceRootPath?: string;
    workspaceCwd?: string;
    updatedAt: number;
};

function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function getConvexSiteUrl(): string {
    const value = process.env.AGENTCHAT_CONVEX_SITE_URL?.trim();
    if (!value) {
        throw new Error("AGENTCHAT_CONVEX_SITE_URL is not configured.");
    }
    return trimTrailingSlash(value);
}

function getRuntimeIngressSecret(): string {
    const value = process.env.RUNTIME_INGRESS_SECRET?.trim();
    if (!value) {
        throw new Error("RUNTIME_INGRESS_SECRET is not configured.");
    }
    return value;
}

export class RuntimePersistenceClient {
    private readonly baseUrl: string;
    private readonly secret: string;

    constructor() {
        this.baseUrl = getConvexSiteUrl();
        this.secret = getRuntimeIngressSecret();
    }

    async runStarted(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/run-started", payload);
    }

    async messageStarted(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/message-started", payload);
    }

    async messageDelta(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/message-delta", payload);
    }

    async runCompleted(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/run-completed", payload);
    }

    async runInterrupted(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/run-interrupted", payload);
    }

    async runFailed(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/run-failed", payload);
    }

    async recoverStaleRun(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/run-stale", payload);
    }

    async runtimeBinding(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/runtime-binding", payload);
    }

    async readRuntimeBinding(payload: {
        userId: string;
        conversationLocalId: string;
    }): Promise<PersistedRuntimeBinding | null> {
        const response = await this.post(
            "/runtime/runtime-binding/read",
            payload,
        );
        const result =
            (await response.json()) as PersistedRuntimeBinding | null;
        return result;
    }

    async listAllChatLocalIds(): Promise<
        Array<{ agentId: string; userId: string; localId: string }>
    > {
        const entries: Array<{
            agentId: string;
            userId: string;
            localId: string;
        }> = [];
        let cursor: string | null = null;
        let isDone = false;

        while (!isDone) {
            const response = await this.post("/runtime/chat-local-ids", {
                cursor,
            });
            const page = (await response.json()) as {
                entries: Array<{
                    agentId: string;
                    userId: string;
                    localId: string;
                }>;
                continueCursor: string;
                isDone: boolean;
            };
            entries.push(...page.entries);
            cursor = page.continueCursor;
            isDone = page.isDone;
        }

        return entries;
    }

    async chatExists(
        userId: string,
        agentId: string,
        localId: string,
    ): Promise<boolean> {
        const response = await this.post("/runtime/chat-exists", {
            userId,
            agentId,
            localId,
        });
        return (await response.json()) as boolean;
    }

    private async post(
        path: string,
        payload: RuntimeEventPayload,
    ): Promise<Response> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-agentchat-runtime-secret": this.secret,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(
                `Runtime persistence request failed (${response.status}) for ${path}: ${body}`,
            );
        }

        return response;
    }
}
