import type { AgentConfig, ProviderConfig } from "./config.ts";

export type RuntimeKindId = "codex";

export type RuntimeKindEvent =
    | {
          type: "reasoning";
          text: string;
      }
    | {
          type: "assistant_delta";
          delta: string;
      }
    | {
          type: "turn_aborted";
      }
    | {
          type: "turn_completed";
          status: "completed" | "interrupted" | "errored";
          errorMessage?: string;
      };

export type RuntimeOpenThreadParams = {
    bindingProviderId: string | null;
    bindingThreadId: string | null;
    providerId: string;
    modelId: string;
    cwd: string;
};

export type RuntimeStartTurnParams = {
    threadId: string;
    inputText: string;
    cwd: string;
    modelId: string;
    variantId: string | null;
};

export type RuntimeKindSession = {
    initialize(): Promise<void>;
    openThread(
        params: RuntimeOpenThreadParams,
    ): Promise<{ threadId: string; isNew: boolean }>;
    startTurn(params: RuntimeStartTurnParams): Promise<{ turnId: string }>;
    interruptTurn(params: { threadId: string; turnId: string }): Promise<void>;
    onEvent(handler: (event: RuntimeKindEvent) => void): void;
    onExit(handler: (error: Error) => void): void;
    stop(): Promise<void>;
};

export type ProviderModelCatalogEntry = {
    id: string;
    label: string;
    supportsReasoning: boolean;
    variants: Array<{
        id: string;
        label: string;
    }>;
};

export type RuntimeKind = {
    kind: RuntimeKindId;
    createSession(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): RuntimeKindSession;
    shouldRecycleProvider(
        current: ProviderConfig,
        next: ProviderConfig,
    ): boolean;
    listModels(params: {
        provider: ProviderConfig;
        agent: AgentConfig;
    }): Promise<ProviderModelCatalogEntry[]>;
};
