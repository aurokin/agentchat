import type { AgentConfig, ProviderConfig } from "./config.ts";

export type RuntimeKindId = "codex";

export type RuntimeProviderEventPhase =
    | "initialization"
    | "thread"
    | "turn"
    | "usage"
    | "model"
    | "completion"
    | "diagnostic";

export type RuntimeProviderEventMetadata =
    | string
    | number
    | boolean
    | null
    | RuntimeProviderEventMetadata[]
    | { [key: string]: RuntimeProviderEventMetadata };

export type RuntimeProviderEvent = {
    id: string;
    providerKind: RuntimeKindId;
    eventType: string;
    phase: RuntimeProviderEventPhase;
    summary: string;
    stable: boolean;
    metadata: Record<string, RuntimeProviderEventMetadata>;
};

export type RuntimeKindLifecycleResult = {
    providerEvents?: RuntimeProviderEvent[];
};

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
      }
    | {
          type: "provider_event";
          event: RuntimeProviderEvent;
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
    initialize(): Promise<RuntimeKindLifecycleResult>;
    openThread(
        params: RuntimeOpenThreadParams,
    ): Promise<
        RuntimeKindLifecycleResult & { threadId: string; isNew: boolean }
    >;
    startTurn(
        params: RuntimeStartTurnParams,
    ): Promise<RuntimeKindLifecycleResult & { turnId: string }>;
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
    defaultVariantId?: string | null;
    providerMetadata?: Record<string, string | number | boolean | null>;
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
