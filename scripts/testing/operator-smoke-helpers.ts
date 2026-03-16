import {
    AGENT_DIAGNOSTIC_ISSUES,
    PROVIDER_DIAGNOSTIC_ISSUES,
} from "../../apps/server/src/configDiagnostics.ts";

export type OperatorSmokeProvider = {
    id: string;
    enabled: boolean;
    models: Array<{
        id: string;
        enabled: boolean;
        variants: Array<{
            id: string;
            enabled: boolean;
        }>;
    }>;
};

export type OperatorSmokeAgent = {
    id: string;
    enabled: boolean;
    providerIds: string[];
    defaultProviderId: string;
    defaultModel?: string;
    defaultVariant?: string;
};

export type OperatorAuthProviderKind = "google" | "local";

export type OperatorSmokeAuthConfig = {
    defaultProviderId?: string | null;
    providers?: Array<{
        id: string;
        kind: OperatorAuthProviderKind;
        enabled?: boolean;
    }>;
};

export type OperatorSmokeConfig = {
    auth?: OperatorSmokeAuthConfig;
    providers: OperatorSmokeProvider[];
    agents: OperatorSmokeAgent[];
};

export type OperatorDiagnosticsPayload = {
    ok: boolean;
    config: {
        loadedAt: number;
        lastReloadAttemptAt: number | null;
        lastReloadError: string | null;
    };
    providers: Array<{
        id: string;
        issues: string[];
    }>;
    agents: Array<{
        id: string;
        issues: string[];
    }>;
};

export type OperatorBootstrapPayload = {
    providers: Array<{ id: string }>;
    agents: Array<{ id: string }>;
};

export type OperatorAgentOptionsPayload = {
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
};

function invariant(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

export function resolveFallbackDefaults(params: {
    config: OperatorSmokeConfig;
    agentId: string;
}): {
    defaultProviderId: string;
    defaultModel: string | null;
    defaultVariant: string | null;
} {
    const agent = params.config.agents.find(
        (candidate) => candidate.id === params.agentId,
    );
    invariant(agent, `Missing agent ${params.agentId} in config.`);

    const provider =
        params.config.providers.find(
            (candidate) =>
                candidate.id === agent.defaultProviderId && candidate.enabled,
        ) ??
        params.config.providers.find(
            (candidate) =>
                candidate.enabled && agent.providerIds.includes(candidate.id),
        ) ??
        null;

    if (!provider) {
        return {
            defaultProviderId: agent.defaultProviderId,
            defaultModel: null,
            defaultVariant: null,
        };
    }

    const defaultModel =
        provider.models.find((model) => model.enabled)?.id ?? null;
    const defaultVariant =
        provider.models
            .find((model) => model.id === defaultModel)
            ?.variants.find((variant) => variant.enabled)?.id ?? null;

    return {
        defaultProviderId: provider.id,
        defaultModel,
        defaultVariant,
    };
}

export function resolveOperatorAuthProviderKind(
    config: OperatorSmokeConfig,
): OperatorAuthProviderKind {
    const providers = config.auth?.providers ?? [];
    const defaultProviderId = config.auth?.defaultProviderId ?? null;
    const activeProvider =
        providers.find(
            (provider) =>
                provider.id === defaultProviderId && provider.enabled !== false,
        ) ?? providers.find((provider) => provider.enabled !== false);

    return activeProvider?.kind ?? "google";
}

export function withOperatorAgentEnabled(params: {
    config: OperatorSmokeConfig;
    agentId: string;
    enabled: boolean;
}): OperatorSmokeConfig {
    const nextConfig = structuredClone(params.config);
    const agent = nextConfig.agents.find(
        (candidate) => candidate.id === params.agentId,
    );
    invariant(agent, `Missing agent ${params.agentId} in config.`);
    agent.enabled = params.enabled;
    return nextConfig;
}

export function withOperatorProviderEnabled(params: {
    config: OperatorSmokeConfig;
    providerId: string;
    enabled: boolean;
}): OperatorSmokeConfig {
    const nextConfig = structuredClone(params.config);
    const provider = nextConfig.providers.find(
        (candidate) => candidate.id === params.providerId,
    );
    invariant(provider, `Missing provider ${params.providerId} in config.`);
    provider.enabled = params.enabled;
    return nextConfig;
}

export function hasAgentDisappearedFromBootstrap(
    bootstrap: OperatorBootstrapPayload,
    agentId: string,
): boolean {
    return !bootstrap.agents.some((agent) => agent.id === agentId);
}

export function hasProviderDisappearedFromBootstrap(params: {
    bootstrap: OperatorBootstrapPayload;
    providerId: string;
}): boolean {
    return (
        !params.bootstrap.providers.some(
            (provider) => provider.id === params.providerId,
        ) && params.bootstrap.agents.length === 0
    );
}

export function matchesResolvedFallbackDefaults(params: {
    options: OperatorAgentOptionsPayload;
    resolvedDefaults: {
        defaultProviderId: string;
        defaultModel: string | null;
        defaultVariant: string | null;
    };
}): boolean {
    return (
        params.options.defaultProviderId ===
            params.resolvedDefaults.defaultProviderId &&
        params.options.defaultModel === params.resolvedDefaults.defaultModel &&
        params.options.defaultVariant ===
            params.resolvedDefaults.defaultVariant
    );
}

export function hasInvalidReloadError(
    diagnostics: OperatorDiagnosticsPayload,
): boolean {
    return diagnostics.config.lastReloadError !== null;
}

export function hasMissingAgentRootIssue(params: {
    diagnostics: OperatorDiagnosticsPayload;
    agentId: string;
}): boolean {
    return params.diagnostics.agents.some(
        (agent) =>
            agent.id === params.agentId &&
            agent.issues.includes(AGENT_DIAGNOSTIC_ISSUES.rootPathMissing),
    );
}

export function hasMissingProviderCwdIssue(params: {
    diagnostics: OperatorDiagnosticsPayload;
    providerId: string;
}): boolean {
    return params.diagnostics.providers.some(
        (provider) =>
            provider.id === params.providerId &&
            provider.issues.includes(PROVIDER_DIAGNOSTIC_ISSUES.codexCwdMissing),
    );
}

export function isRestoredOperatorDiagnostics(params: {
    diagnostics: OperatorDiagnosticsPayload;
    agentId: string;
    providerId: string;
}): boolean {
    return (
        params.diagnostics.config.lastReloadError === null &&
        !params.diagnostics.agents.some(
            (agent) =>
                agent.id === params.agentId && agent.issues.length > 0,
        ) &&
        !params.diagnostics.providers.some(
            (provider) =>
                provider.id === params.providerId &&
                provider.issues.includes(
                    PROVIDER_DIAGNOSTIC_ISSUES.codexCwdMissing,
                ),
        )
    );
}
