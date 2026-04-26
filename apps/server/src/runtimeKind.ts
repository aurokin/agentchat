import type { AgentConfig, ProviderConfig } from "./config.ts";

export type RuntimeKindId = "codex";

export type RuntimeLifecycleModel =
    | "persistent-session"
    | "per-turn-subprocess"
    | "external-server";

export type RuntimeModelCatalogSource =
    | "live"
    | "static"
    | "configured"
    | "hybrid";

export type RuntimeResumabilityStyle =
    | "thread-id"
    | "session-id"
    | "resume-token"
    | "provider-storage"
    | "none";

export type RuntimeCancellationStyle =
    | "cooperative-command"
    | "process-signal"
    | "http-abort"
    | "unsupported";

export type RuntimeApprovalBehavior =
    | "auto-approve"
    | "auto-deny"
    | "unsupported";

export type RuntimeArtifactCategory =
    | "lifecycle"
    | "usage"
    | "reasoning"
    | "tool"
    | "command"
    | "diff"
    | "plan"
    | "review"
    | "model"
    | "diagnostic";

export type RuntimeWorkspaceBehavior = "shared-root" | "copy-on-conversation";

export type RuntimeKindCapabilities = {
    lifecycleModel: RuntimeLifecycleModel;
    modelCatalogSource: RuntimeModelCatalogSource;
    resumability: readonly RuntimeResumabilityStyle[];
    cancellation: readonly RuntimeCancellationStyle[];
    approval: RuntimeApprovalBehavior;
    artifacts: readonly RuntimeArtifactCategory[];
    workspace: readonly RuntimeWorkspaceBehavior[];
};

export type RuntimeProviderEventPhase =
    | "initialization"
    | "thread"
    | "turn"
    | "usage"
    | "model"
    | "completion"
    | "artifact"
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

export type RuntimeNormalizedUpdateCategory =
    | "assistant-text-delta"
    | "assistant-status"
    | "reasoning"
    | "tool-call-started"
    | "tool-call-updated"
    | "tool-call-completed"
    | "command-output"
    | "file-diff"
    | "plan-update"
    | "review-artifact"
    | "approval-requested"
    | "permission-resolved"
    | "user-input-requested"
    | "turn-completed"
    | "turn-cancelled"
    | "turn-failed"
    | "provider-artifact";

export const RUNTIME_NORMALIZED_UPDATE_CATEGORIES = [
    "assistant-text-delta",
    "assistant-status",
    "reasoning",
    "tool-call-started",
    "tool-call-updated",
    "tool-call-completed",
    "command-output",
    "file-diff",
    "plan-update",
    "review-artifact",
    "approval-requested",
    "permission-resolved",
    "user-input-requested",
    "turn-completed",
    "turn-cancelled",
    "turn-failed",
    "provider-artifact",
] as const satisfies readonly RuntimeNormalizedUpdateCategory[];

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
    capabilities: RuntimeKindCapabilities;
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
