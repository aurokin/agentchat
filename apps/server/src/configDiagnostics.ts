import { existsSync, statSync } from "node:fs";
import path from "node:path";

import type { AgentConfig, AgentchatConfig, ProviderConfig } from "./config.ts";

export type ProviderDiagnostics = {
    id: string;
    label: string;
    enabled: boolean;
    ready: boolean;
    enabledModelCount: number;
    issues: string[];
};

export type AgentDiagnostics = {
    id: string;
    name: string;
    enabled: boolean;
    ready: boolean;
    availableProviderIds: string[];
    resolvedDefaultProviderId: string | null;
    issues: string[];
};

export type ConfigDiagnostics = {
    ok: boolean;
    auth: {
        activeProviderKind:
            | AgentchatConfig["auth"]["providers"][number]["kind"]
            | null;
        issues: string[];
    };
    summary: {
        enabledProviderCount: number;
        readyProviderCount: number;
        enabledAgentCount: number;
        readyAgentCount: number;
    };
    providers: ProviderDiagnostics[];
    agents: AgentDiagnostics[];
};

export const AUTH_DIAGNOSTIC_ISSUES = {
    noEnabledProviders: "No enabled auth providers are configured.",
    defaultProviderMissing:
        "Configured default auth provider is missing; fallback will be used.",
    defaultProviderDisabled:
        "Configured default auth provider is disabled; fallback will be used.",
} as const;

export const PROVIDER_DIAGNOSTIC_ISSUES = {
    noEnabledModels: "Enabled provider has no enabled models.",
    codexCwdMissing:
        "Configured codex.cwd does not exist or is not a directory.",
    codexCommandMissing: "Configured Codex command path does not exist.",
} as const;

export const AGENT_DIAGNOSTIC_ISSUES = {
    rootPathMissing: "Agent rootPath does not exist or is not a directory.",
    noEnabledProviders: "Agent has no enabled providers.",
    defaultProviderFallback:
        "Agent default provider is disabled; fallback will be used.",
    defaultModelFallback:
        "Agent default model is unavailable; fallback will be used.",
    defaultVariantFallback:
        "Agent default variant is unavailable; fallback will be used.",
} as const;

type ResolvedAgentDefaults = {
    defaultProviderId: string | null;
    defaultModel: string | null;
    defaultVariant: string | null;
    allowedProviders: ProviderConfig[];
};

function getAuthDiagnostics(config: AgentchatConfig): ConfigDiagnostics["auth"] {
    const enabledProviders = config.auth.providers.filter(
        (provider) => provider.enabled,
    );
    const configuredDefaultProvider =
        config.auth.providers.find(
            (provider) => provider.id === config.auth.defaultProviderId,
        ) ?? null;
    const activeAuthProvider =
        enabledProviders.find(
            (provider) => provider.id === config.auth.defaultProviderId,
        ) ??
        enabledProviders[0] ??
        null;
    const issues: string[] = [];

    if (enabledProviders.length === 0) {
        issues.push(AUTH_DIAGNOSTIC_ISSUES.noEnabledProviders);
    } else if (!configuredDefaultProvider) {
        issues.push(AUTH_DIAGNOSTIC_ISSUES.defaultProviderMissing);
    } else if (!configuredDefaultProvider.enabled) {
        issues.push(AUTH_DIAGNOSTIC_ISSUES.defaultProviderDisabled);
    }

    return {
        activeProviderKind: activeAuthProvider?.kind ?? null,
        issues,
    };
}

function isExistingDirectory(targetPath: string): boolean {
    if (!existsSync(targetPath)) {
        return false;
    }

    return statSync(targetPath).isDirectory();
}

export function getEnabledProviders(config: AgentchatConfig): ProviderConfig[] {
    return config.providers.filter((provider) => provider.enabled);
}

export function getAvailableProvidersForAgent(
    config: AgentchatConfig,
    agent: AgentConfig,
): ProviderConfig[] {
    const enabledProviderIds = new Set(
        getEnabledProviders(config).map((provider) => provider.id),
    );

    return config.providers.filter(
        (provider) =>
            enabledProviderIds.has(provider.id) &&
            agent.providerIds.includes(provider.id),
    );
}

export function resolveAgentDefaults(
    config: AgentchatConfig,
    agent: AgentConfig,
): ResolvedAgentDefaults {
    const allowedProviders = getAvailableProvidersForAgent(config, agent);
    const defaultProvider =
        allowedProviders.find(
            (provider) => provider.id === agent.defaultProviderId,
        ) ??
        allowedProviders[0] ??
        null;

    if (!defaultProvider) {
        return {
            defaultProviderId: null,
            defaultModel: null,
            defaultVariant: null,
            allowedProviders,
        };
    }

    const allowedModelIds =
        agent.modelAllowlist.length > 0 ? new Set(agent.modelAllowlist) : null;
    const allowedVariantIds =
        agent.variantAllowlist.length > 0
            ? new Set(agent.variantAllowlist)
            : null;

    const enabledModels = defaultProvider.models.filter(
        (model) =>
            model.enabled &&
            (allowedModelIds === null || allowedModelIds.has(model.id)),
    );
    const defaultModel =
        enabledModels.find((model) => model.id === agent.defaultModel) ??
        enabledModels[0] ??
        null;

    if (!defaultModel) {
        return {
            defaultProviderId: defaultProvider.id,
            defaultModel: null,
            defaultVariant: null,
            allowedProviders,
        };
    }

    const enabledVariants = defaultModel.variants.filter(
        (variant) =>
            variant.enabled &&
            (allowedVariantIds === null || allowedVariantIds.has(variant.id)),
    );
    const defaultVariant =
        enabledVariants.find(
            (variant) => variant.id === agent.defaultVariant,
        ) ??
        enabledVariants[0] ??
        null;

    return {
        defaultProviderId: defaultProvider.id,
        defaultModel: defaultModel.id,
        defaultVariant: defaultVariant?.id ?? null,
        allowedProviders,
    };
}

export function getVisibleAgents(config: AgentchatConfig): AgentConfig[] {
    return config.agents
        .filter(
            (agent) =>
                agent.enabled &&
                getAvailableProvidersForAgent(config, agent).length > 0,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getProviderDiagnostics(
    provider: ProviderConfig,
): ProviderDiagnostics {
    const issues: string[] = [];
    const enabledModelCount = provider.models.filter(
        (model) => model.enabled,
    ).length;

    if (provider.enabled && enabledModelCount === 0) {
        issues.push(PROVIDER_DIAGNOSTIC_ISSUES.noEnabledModels);
    }

    if (provider.codex.cwd && !isExistingDirectory(provider.codex.cwd)) {
        issues.push(PROVIDER_DIAGNOSTIC_ISSUES.codexCwdMissing);
    }

    if (
        path.isAbsolute(provider.codex.command) &&
        !existsSync(provider.codex.command)
    ) {
        issues.push(PROVIDER_DIAGNOSTIC_ISSUES.codexCommandMissing);
    }

    return {
        id: provider.id,
        label: provider.label,
        enabled: provider.enabled,
        ready: provider.enabled && issues.length === 0,
        enabledModelCount,
        issues,
    };
}

export function getAgentDiagnostics(
    config: AgentchatConfig,
    agent: AgentConfig,
): AgentDiagnostics {
    const issues: string[] = [];
    const resolvedDefaults = resolveAgentDefaults(config, agent);
    const availableProviderIds = resolvedDefaults.allowedProviders.map(
        (provider) => provider.id,
    );

    if (agent.enabled && !isExistingDirectory(agent.rootPath)) {
        issues.push(AGENT_DIAGNOSTIC_ISSUES.rootPathMissing);
    }

    if (agent.enabled && availableProviderIds.length === 0) {
        issues.push(AGENT_DIAGNOSTIC_ISSUES.noEnabledProviders);
    }

    if (
        agent.enabled &&
        availableProviderIds.length > 0 &&
        !availableProviderIds.includes(agent.defaultProviderId)
    ) {
        issues.push(AGENT_DIAGNOSTIC_ISSUES.defaultProviderFallback);
    }

    if (
        agent.enabled &&
        agent.defaultModel &&
        resolvedDefaults.defaultModel === null
    ) {
        issues.push(AGENT_DIAGNOSTIC_ISSUES.defaultModelFallback);
    }

    if (
        agent.enabled &&
        agent.defaultVariant &&
        resolvedDefaults.defaultModel !== null &&
        resolvedDefaults.defaultVariant === null
    ) {
        issues.push(AGENT_DIAGNOSTIC_ISSUES.defaultVariantFallback);
    }

    return {
        id: agent.id,
        name: agent.name,
        enabled: agent.enabled,
        ready: agent.enabled && issues.length === 0,
        availableProviderIds,
        resolvedDefaultProviderId: resolvedDefaults.defaultProviderId,
        issues,
    };
}

export function getConfigDiagnostics(
    config: AgentchatConfig,
): ConfigDiagnostics {
    const providers = config.providers.map(getProviderDiagnostics);
    const agents = config.agents.map((agent) =>
        getAgentDiagnostics(config, agent),
    );
    const auth = getAuthDiagnostics(config);

    return {
        ok:
            providers.every(
                (provider) => !provider.enabled || provider.ready,
            ) && agents.every((agent) => !agent.enabled || agent.ready),
        auth,
        summary: {
            enabledProviderCount: providers.filter(
                (provider) => provider.enabled,
            ).length,
            readyProviderCount: providers.filter((provider) => provider.ready)
                .length,
            enabledAgentCount: agents.filter((agent) => agent.enabled).length,
            readyAgentCount: agents.filter((agent) => agent.ready).length,
        },
        providers,
        agents,
    };
}
