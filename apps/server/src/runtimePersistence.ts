type RuntimeEventPayload = Record<string, unknown>;

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

    async runtimeBinding(payload: RuntimeEventPayload): Promise<void> {
        await this.post("/runtime/runtime-binding", payload);
    }

    private async post(
        path: string,
        payload: RuntimeEventPayload,
    ): Promise<void> {
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
    }
}
