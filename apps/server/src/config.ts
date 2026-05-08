import { existsSync, readFileSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";
import {
    canonicalizePathForComparison,
    pathsOverlap,
} from "./pathComparison.ts";
import { isSafePathSegment } from "./sandboxPaths.ts";
import {
    resolveDefaultInstanceKey,
    resolveDefaultStateId,
} from "./serverState.ts";

const GoogleAuthProviderSchema = z.object({
    id: z.string().min(1),
    kind: z.literal("google"),
    enabled: z.boolean(),
    allowlistMode: z.literal("email"),
    allowedEmails: z.array(z.email()),
    allowedDomains: z.array(z.string()),
    googleHostedDomain: z.union([z.string(), z.null()]),
});

const LocalAuthProviderSchema = z.object({
    id: z.string().min(1),
    kind: z.literal("local"),
    enabled: z.boolean(),
    allowSignup: z.boolean(),
});

const AuthProviderSchema = z.discriminatedUnion("kind", [
    GoogleAuthProviderSchema,
    LocalAuthProviderSchema,
]);

const ProviderAuthConfigSchema = z
    .object({
        defaultProviderId: z.string().min(1),
        providers: z.array(AuthProviderSchema).min(1),
    })
    .superRefine((auth, ctx) => {
        const providerIds = new Set<string>();

        for (const provider of auth.providers) {
            if (providerIds.has(provider.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate auth provider id '${provider.id}'.`,
                });
            }
            providerIds.add(provider.id);
        }

        const defaultProvider = auth.providers.find(
            (provider) => provider.id === auth.defaultProviderId,
        );
        if (!defaultProvider) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Auth defaultProviderId '${auth.defaultProviderId}' must exist in auth.providers.`,
            });
        } else if (!defaultProvider.enabled) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Auth defaultProviderId '${auth.defaultProviderId}' must reference an enabled provider.`,
            });
        }
    });

const ProviderVariantSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
});

const ProviderModelSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    supportsReasoning: z.boolean(),
    variants: z.array(ProviderVariantSchema).default([]),
});

const DEFAULT_CLAUDE_CODE_PROVIDER_MODELS = [
    {
        id: "sonnet",
        label: "Claude Sonnet",
        enabled: true,
        supportsReasoning: false,
        variants: [
            { id: "default", label: "Default", enabled: true },
            { id: "plan", label: "Plan", enabled: true },
        ],
    },
    {
        id: "opus",
        label: "Claude Opus",
        enabled: true,
        supportsReasoning: false,
        variants: [
            { id: "default", label: "Default", enabled: true },
            { id: "plan", label: "Plan", enabled: true },
        ],
    },
];

const DEFAULT_ACP_PROVIDER_MODELS = [
    {
        id: "default",
        label: "Default",
        enabled: true,
        supportsReasoning: false,
        variants: [{ id: "default", label: "Default", enabled: true }],
    },
];

const ProviderBaseSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    idleTtlSeconds: z.number().int().positive(),
    modelCacheTtlSeconds: z.number().int().positive(),
    models: z.array(ProviderModelSchema).default([]),
});

const CodexProviderSchema = ProviderBaseSchema.extend({
    kind: z.literal("codex"),
    codex: z.object({
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        baseEnv: z.record(z.string(), z.string()),
        cwd: z.string().min(1).optional(),
    }),
});

const ClaudeCodeProviderSchema = ProviderBaseSchema.extend({
    kind: z.literal("claude-code"),
    claudeCode: z.object({
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        baseEnv: z.record(z.string(), z.string()),
        cwd: z.string().min(1).optional(),
        permissionMode: z
            .enum([
                "default",
                "acceptEdits",
                "plan",
                "auto",
                "dontAsk",
                "bypassPermissions",
            ])
            .default("auto"),
        timeoutMs: z.number().int().positive().optional(),
    }),
});

const AcpMcpServerSchema = z.object({
    type: z.literal("stdio").default("stdio"),
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z
        .array(
            z.object({
                name: z.string().min(1),
                value: z.string(),
            }),
        )
        .default([]),
});

const AcpProviderSchema = ProviderBaseSchema.extend({
    kind: z.literal("acp"),
    acp: z.object({
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        baseEnv: z.record(z.string(), z.string()).default({}),
        cwd: z.string().min(1).optional(),
        mcpServers: z.array(AcpMcpServerSchema).default([]),
        permissionMode: z
            .enum(["auto-approve", "fail-closed"])
            .default("fail-closed"),
        timeoutMs: z.number().int().positive().optional(),
    }),
});

const RuntimeProviderSchema = z.discriminatedUnion("kind", [
    CodexProviderSchema,
    AcpProviderSchema,
    ClaudeCodeProviderSchema,
]);

const AgentRuntimeBaseSchema = z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1).default("Codex"),
    enabled: z.boolean().default(true),
    idleTtlSeconds: z.number().int().positive().default(900),
    modelCacheTtlSeconds: z.number().int().positive().default(300),
    models: z.array(ProviderModelSchema).default([]),
});

const CodexAgentRuntimeSchema = AgentRuntimeBaseSchema.extend({
    kind: z.literal("codex"),
    label: z.string().min(1).default("Codex"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    baseEnv: z.record(z.string(), z.string()).default({}),
    cwd: z.string().min(1).optional(),
});

const ClaudeCodeAgentRuntimeSchema = AgentRuntimeBaseSchema.extend({
    kind: z.literal("claude-code"),
    label: z.string().min(1).default("Claude Code"),
    command: z.string().min(1).default("claude"),
    args: z.array(z.string()).default([]),
    baseEnv: z.record(z.string(), z.string()).default({}),
    cwd: z.string().min(1).optional(),
    permissionMode: z
        .enum([
            "default",
            "acceptEdits",
            "plan",
            "auto",
            "dontAsk",
            "bypassPermissions",
        ])
        .default("auto"),
    timeoutMs: z.number().int().positive().optional(),
});

const AcpAgentRuntimeSchema = AgentRuntimeBaseSchema.extend({
    kind: z.literal("acp"),
    label: z.string().min(1).default("ACP"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    baseEnv: z.record(z.string(), z.string()).default({}),
    cwd: z.string().min(1).optional(),
    mcpServers: z.array(AcpMcpServerSchema).default([]),
    permissionMode: z
        .enum(["auto-approve", "fail-closed"])
        .default("fail-closed"),
    timeoutMs: z.number().int().positive().optional(),
});

const AgentRuntimeSchema = z.discriminatedUnion("kind", [
    CodexAgentRuntimeSchema,
    AcpAgentRuntimeSchema,
    ClaudeCodeAgentRuntimeSchema,
]);

const AgentSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        avatar: z.union([z.string(), z.null()]).optional(),
        enabled: z.boolean(),
        rootPath: z.string().min(1),
        providerIds: z.array(z.string().min(1)).default([]),
        defaultProviderId: z.string().min(1).optional(),
        runtime: AgentRuntimeSchema.optional(),
        defaultModel: z.string().min(1).optional(),
        defaultVariant: z.string().min(1).optional(),
        defaultVisible: z.boolean().default(true),
        visibilityOverrides: z.array(z.string().min(1)).default([]),
        modelAllowlist: z.array(z.string()).default([]),
        variantAllowlist: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        sortOrder: z.number().int().default(0),
        workspaceMode: z
            .enum(["shared", "copy-on-conversation"])
            .default("shared"),
    })
    .superRefine((agent, ctx) => {
        // Path fields (rootPath, runtime.cwd, provider.*.cwd, sandboxRoot)
        // accept relative paths; they're resolved against the config file's
        // directory in normalizeParsedConfig. Use `"."` to mean "this
        // worktree".

        if (
            agent.workspaceMode === "copy-on-conversation" &&
            !isSafePathSegment(agent.id)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Agent '${agent.id}' id must be a safe filesystem path segment when workspaceMode is copy-on-conversation.`,
            });
        }

        if (!agent.runtime && agent.providerIds.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Agent '${agent.id}' must define either runtime or providerIds.`,
            });
        }
    });

const AgentchatConfigInputSchema = z
    .object({
        version: z.literal(1),
        auth: ProviderAuthConfigSchema,
        stateId: z.string().min(1).optional(),
        sandboxRoot: z.string().min(1).optional(),
        providers: z.array(RuntimeProviderSchema).default([]),
        agents: z.array(AgentSchema),
    })
    .superRefine((config, ctx) => {
        const providerIds = new Set<string>();
        for (const provider of config.providers) {
            if (providerIds.has(provider.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate provider id '${provider.id}'.`,
                });
            }
            providerIds.add(provider.id);
        }

        const resolvedSandboxRoot = path.resolve(
            config.sandboxRoot ?? DEFAULT_SANDBOX_ROOT,
        );

        const agentIds = new Set<string>();
        const agentRuntimeProviderIds = new Set<string>();
        for (const agent of config.agents) {
            if (agentIds.has(agent.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate agent id '${agent.id}'.`,
                });
            }
            agentIds.add(agent.id);

            const runtimeProviderId = agent.runtime
                ? getAgentRuntimeProviderId(agent)
                : null;
            if (runtimeProviderId && providerIds.has(runtimeProviderId)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Agent '${agent.id}' runtime id '${runtimeProviderId}' conflicts with a top-level provider id.`,
                });
            }
            if (
                runtimeProviderId &&
                agentRuntimeProviderIds.has(runtimeProviderId)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate agent runtime provider id '${runtimeProviderId}'.`,
                });
            }
            if (runtimeProviderId) {
                agentRuntimeProviderIds.add(runtimeProviderId);
            }

            const effectiveProviderIds = runtimeProviderId
                ? [
                      runtimeProviderId,
                      ...agent.providerIds.filter(
                          (providerId) => providerId !== runtimeProviderId,
                      ),
                  ]
                : agent.providerIds;
            const effectiveDefaultProviderId =
                agent.defaultProviderId ?? runtimeProviderId;
            if (
                effectiveDefaultProviderId &&
                !effectiveProviderIds.includes(effectiveDefaultProviderId)
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Agent '${agent.id}' defaultProviderId must exist in providerIds.`,
                });
            }

            for (const providerId of effectiveProviderIds) {
                if (providerId === runtimeProviderId) {
                    continue;
                }
                if (!providerIds.has(providerId)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Agent '${agent.id}' references unknown provider '${providerId}'.`,
                    });
                }
            }

            const resolvedRootPath = path.resolve(agent.rootPath);
            if (pathsOverlap(resolvedSandboxRoot, resolvedRootPath)) {
                const effectiveSandboxRoot =
                    config.sandboxRoot ?? DEFAULT_SANDBOX_ROOT;
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Agent '${agent.id}' rootPath '${agent.rootPath}' overlaps with sandboxRoot '${effectiveSandboxRoot}'. These must be disjoint to prevent recursive copies and accidental deletions.`,
                });
            }
        }
    });

export type AuthProviderConfig = z.infer<typeof AuthProviderSchema>;
export type AuthConfig = z.infer<typeof ProviderAuthConfigSchema>;
type AgentConfigInput = z.infer<typeof AgentSchema>;
export type CodexProviderConfig = z.infer<typeof CodexProviderSchema>;
export type ClaudeCodeProviderConfig = z.infer<typeof ClaudeCodeProviderSchema>;
export type AcpProviderConfig = z.infer<typeof AcpProviderSchema>;
export type ProviderConfig = z.infer<typeof RuntimeProviderSchema>;
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeSchema>;
export type AgentConfig = Omit<
    AgentConfigInput,
    "providerIds" | "defaultProviderId"
> & {
    providerIds: string[];
    defaultProviderId: string;
};
export type AgentchatConfig = Omit<
    z.infer<typeof AgentchatConfigInputSchema>,
    "agents" | "auth" | "sandboxRoot" | "stateId"
> & {
    agents: AgentConfig[];
    auth: AuthConfig;
    stateId?: string;
    sandboxRoot: string;
    instanceKey: string;
};
export type ConfigStoreStatus = {
    loadedAt: number;
    lastReloadAttemptAt: number | null;
    lastReloadError: string | null;
};

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(srcDir, "..");
const exampleConfigPath = path.join(appDir, "agentchat.config.example.json");

export function resolveDefaultConfigPath(): string {
    const cwdConfigPath = path.resolve(process.cwd(), "agentchat.config.json");
    if (existsSync(cwdConfigPath)) {
        return cwdConfigPath;
    }
    return exampleConfigPath;
}

const DEFAULT_SANDBOX_ROOT = path.join(os.homedir(), ".agentchat", "sandboxes");

function getFallbackAgentRuntimeProviderId(agentId: string): string {
    return `${agentId}-runtime`;
}

function getDefaultClaudeCodeProviderModels(): Array<
    z.infer<typeof ProviderModelSchema>
> {
    return structuredClone(DEFAULT_CLAUDE_CODE_PROVIDER_MODELS);
}

function getDefaultAcpProviderModels(): Array<
    z.infer<typeof ProviderModelSchema>
> {
    return structuredClone(DEFAULT_ACP_PROVIDER_MODELS);
}

function seedRuntimeProviderModels(provider: ProviderConfig): ProviderConfig {
    if (provider.models.length > 0) {
        return provider;
    }

    if (provider.kind === "claude-code") {
        return {
            ...provider,
            models: getDefaultClaudeCodeProviderModels(),
        };
    }

    if (provider.kind === "acp") {
        return {
            ...provider,
            models: getDefaultAcpProviderModels(),
        };
    }

    return provider;
}

function seedAgentRuntimeModels(agent: AgentConfigInput): AgentConfigInput {
    if (!agent.runtime || agent.runtime.models.length > 0) {
        return agent;
    }

    if (agent.runtime.kind === "claude-code") {
        return {
            ...agent,
            runtime: {
                ...agent.runtime,
                models: getDefaultClaudeCodeProviderModels(),
            },
        };
    }

    if (agent.runtime.kind === "acp") {
        return {
            ...agent,
            runtime: {
                ...agent.runtime,
                models: getDefaultAcpProviderModels(),
            },
        };
    }

    return agent;
}

export function getAgentRuntimeProviderId(
    agent: Pick<AgentConfigInput, "id" | "runtime">,
): string | null {
    if (!agent.runtime) {
        return null;
    }
    return agent.runtime.id ?? getFallbackAgentRuntimeProviderId(agent.id);
}

export function agentRuntimeToProvider(
    agent: Pick<AgentConfig, "enabled" | "id" | "runtime">,
): ProviderConfig | null {
    if (!agent.enabled || !agent.runtime) {
        return null;
    }

    const base = {
        id: agent.runtime.id ?? getFallbackAgentRuntimeProviderId(agent.id),
        label: agent.runtime.label,
        enabled: agent.runtime.enabled,
        idleTtlSeconds: agent.runtime.idleTtlSeconds,
        modelCacheTtlSeconds: agent.runtime.modelCacheTtlSeconds,
        models: agent.runtime.models,
    };

    if (agent.runtime.kind === "codex") {
        return {
            ...base,
            kind: "codex",
            codex: {
                command: agent.runtime.command,
                args: agent.runtime.args,
                baseEnv: agent.runtime.baseEnv,
                cwd: agent.runtime.cwd,
            },
        };
    }

    if (agent.runtime.kind === "acp") {
        return {
            ...base,
            kind: "acp",
            acp: {
                command: agent.runtime.command,
                args: agent.runtime.args,
                baseEnv: agent.runtime.baseEnv,
                cwd: agent.runtime.cwd,
                mcpServers: agent.runtime.mcpServers,
                permissionMode: agent.runtime.permissionMode,
                timeoutMs: agent.runtime.timeoutMs,
            },
        };
    }

    return {
        ...base,
        kind: "claude-code",
        claudeCode: {
            command: agent.runtime.command,
            args: agent.runtime.args,
            baseEnv: agent.runtime.baseEnv,
            cwd: agent.runtime.cwd,
            permissionMode: agent.runtime.permissionMode,
            timeoutMs: agent.runtime.timeoutMs,
        },
    };
}

export function getProviderConfigs(
    config: Pick<AgentchatConfig, "providers" | "agents">,
): ProviderConfig[] {
    const runtimeProviders = config.agents
        .map(agentRuntimeToProvider)
        .filter((provider): provider is ProviderConfig => provider !== null);
    return [...config.providers, ...runtimeProviders];
}

export function getProviderConfig(
    config: Pick<AgentchatConfig, "providers" | "agents">,
    providerId: string,
): ProviderConfig | null {
    return (
        getProviderConfigs(config).find(
            (provider) => provider.id === providerId,
        ) ?? null
    );
}

export function getAgentProviderConfigs(
    config: Pick<AgentchatConfig, "providers" | "agents">,
    agent: Pick<AgentConfig, "providerIds" | "runtime">,
): ProviderConfig[] {
    const providersById = new Map(
        getProviderConfigs(config).map((provider) => [provider.id, provider]),
    );
    return agent.providerIds
        .map((providerId) => providersById.get(providerId) ?? null)
        .filter((provider): provider is ProviderConfig => provider !== null);
}

function getDefaultStateRuntimeBackendIdentity(): string | null {
    const cloudUrl = process.env.CONVEX_URL?.trim();
    if (!cloudUrl) {
        return null;
    }
    return cloudUrl
        .replace(/\/+$/, "")
        .replace(/\.convex\.cloud$/, ".convex.site");
}

function getProviderRuntimeStateSeed(provider: ProviderConfig) {
    if (provider.kind === "codex") {
        return {
            command: provider.codex.command,
            args: provider.codex.args,
            baseEnvKeys: Object.keys(provider.codex.baseEnv).sort(),
            hasCwd: Boolean(provider.codex.cwd),
        };
    }

    if (provider.kind === "acp") {
        return {
            command: provider.acp.command,
            args: provider.acp.args,
            baseEnvKeys: Object.keys(provider.acp.baseEnv).sort(),
            hasCwd: Boolean(provider.acp.cwd),
            mcpServerCount: provider.acp.mcpServers.length,
            permissionMode: provider.acp.permissionMode,
            hasTimeoutMs: provider.acp.timeoutMs !== undefined,
        };
    }

    return {
        command: provider.claudeCode.command,
        args: provider.claudeCode.args,
        baseEnvKeys: Object.keys(provider.claudeCode.baseEnv).sort(),
        hasCwd: Boolean(provider.claudeCode.cwd),
        permissionMode: provider.claudeCode.permissionMode,
        hasTimeoutMs: provider.claudeCode.timeoutMs !== undefined,
    };
}

function getAgentRuntimeStateSeed(
    agent: Pick<AgentConfigInput, "id" | "runtime">,
): Record<string, unknown> | undefined {
    if (!agent.runtime) {
        return undefined;
    }

    return {
        id: getAgentRuntimeProviderId(agent),
        kind: agent.runtime.kind,
        label: agent.runtime.label,
        enabled: agent.runtime.enabled,
        idleTtlSeconds: agent.runtime.idleTtlSeconds,
        modelCacheTtlSeconds: agent.runtime.modelCacheTtlSeconds,
        models: agent.runtime.models,
        command: agent.runtime.command,
        args: agent.runtime.args,
        baseEnvKeys: Object.keys(agent.runtime.baseEnv).sort(),
        hasCwd: Boolean(agent.runtime.cwd),
        ...(agent.runtime.kind === "claude-code"
            ? {
                  permissionMode: agent.runtime.permissionMode,
                  hasTimeoutMs: agent.runtime.timeoutMs !== undefined,
              }
            : {}),
        ...(agent.runtime.kind === "acp"
            ? {
                  mcpServerCount: agent.runtime.mcpServers.length,
                  permissionMode: agent.runtime.permissionMode,
                  hasTimeoutMs: agent.runtime.timeoutMs !== undefined,
              }
            : {}),
    };
}

function buildDefaultStateIdSeed(
    parsed: z.infer<typeof AgentchatConfigInputSchema>,
    auth: AuthConfig,
): string {
    return JSON.stringify({
        version: parsed.version,
        runtimeBackendIdentity: getDefaultStateRuntimeBackendIdentity(),
        auth,
        providers: parsed.providers.map((provider) => ({
            id: provider.id,
            kind: provider.kind,
            label: provider.label,
            enabled: provider.enabled,
            idleTtlSeconds: provider.idleTtlSeconds,
            modelCacheTtlSeconds: provider.modelCacheTtlSeconds,
            models: provider.models,
            runtime: getProviderRuntimeStateSeed(provider),
        })),
        agents: parsed.agents.map(({ rootPath, ...agent }) => ({
            ...agent,
            runtime: getAgentRuntimeStateSeed(agent),
        })),
    });
}

function getProviderRuntimeCwd(provider: ProviderConfig): string | undefined {
    if (provider.kind === "codex") {
        return provider.codex.cwd;
    }
    if (provider.kind === "acp") {
        return provider.acp.cwd;
    }
    return provider.claudeCode.cwd;
}

function buildDefaultInstanceKeySeed(
    parsed: z.infer<typeof AgentchatConfigInputSchema>,
): string {
    return JSON.stringify({
        sandboxRoot: canonicalizePathForComparison(
            parsed.sandboxRoot ?? DEFAULT_SANDBOX_ROOT,
        ),
        providers: parsed.providers.map((provider) => ({
            id: provider.id,
            runtimeCwd: getProviderRuntimeCwd(provider)
                ? canonicalizePathForComparison(
                      getProviderRuntimeCwd(provider)!,
                  )
                : null,
        })),
        agents: parsed.agents.map((agent) => ({
            id: agent.id,
            rootPath: canonicalizePathForComparison(agent.rootPath),
            workspaceMode: agent.workspaceMode ?? "shared",
        })),
    });
}

// Resolves user-facing path values relative to the config file's directory
// when configPath is known, otherwise relative to process.cwd(). Absolute
// paths are returned unchanged. Lets the committed agentchat.config.json
// use `"."` to mean "this worktree" — same file works in every checkout.
function resolvePathRelativeToConfig(
    value: string,
    configPath: string | undefined,
): string {
    if (path.isAbsolute(value)) return value;
    const base = configPath ? path.dirname(configPath) : process.cwd();
    return path.resolve(base, value);
}

function normalizeParsedConfig(
    parsed: z.infer<typeof AgentchatConfigInputSchema>,
    params: {
        configPath?: string;
    } = {},
): AgentchatConfig {
    const { configPath } = params;
    const resolveCwd = (value: string | undefined): string | undefined =>
        value === undefined
            ? undefined
            : resolvePathRelativeToConfig(value, configPath);

    const {
        sandboxRoot: rawSandboxRoot,
        stateId: rawStateId,
        auth,
        ...rest
    } = parsed;
    const sandboxRoot = rawSandboxRoot
        ? resolvePathRelativeToConfig(rawSandboxRoot, configPath)
        : DEFAULT_SANDBOX_ROOT;
    const providers = rest.providers.map((provider) => {
        const seeded = seedRuntimeProviderModels(provider);
        if (seeded.kind === "codex") {
            return {
                ...seeded,
                codex: { ...seeded.codex, cwd: resolveCwd(seeded.codex.cwd) },
            };
        }
        if (seeded.kind === "claude-code") {
            return {
                ...seeded,
                claudeCode: {
                    ...seeded.claudeCode,
                    cwd: resolveCwd(seeded.claudeCode.cwd),
                },
            };
        }
        if (seeded.kind === "acp") {
            return {
                ...seeded,
                acp: { ...seeded.acp, cwd: resolveCwd(seeded.acp.cwd) },
            };
        }
        return seeded;
    });
    const agents: AgentConfig[] = rest.agents.map((rawAgent) => {
        const agent = seedAgentRuntimeModels(rawAgent);
        const runtimeProviderId = getAgentRuntimeProviderId(agent);
        const providerIds = runtimeProviderId
            ? [
                  runtimeProviderId,
                  ...agent.providerIds.filter(
                      (providerId) => providerId !== runtimeProviderId,
                  ),
              ]
            : agent.providerIds;
        const defaultProviderId =
            agent.defaultProviderId ?? providerIds[0] ?? "";
        const resolvedRuntime = agent.runtime
            ? { ...agent.runtime, cwd: resolveCwd(agent.runtime.cwd) }
            : agent.runtime;
        return {
            ...agent,
            rootPath: resolvePathRelativeToConfig(agent.rootPath, configPath),
            runtime: resolvedRuntime,
            providerIds,
            defaultProviderId,
        };
    });
    return {
        ...rest,
        providers,
        agents,
        auth,
        stateId:
            rawStateId?.trim() ||
            resolveDefaultStateId(
                configPath ?? "agentchat.config.json",
                buildDefaultStateIdSeed(parsed, auth),
            ),
        sandboxRoot,
        instanceKey: resolveDefaultInstanceKey(
            buildDefaultInstanceKeySeed(parsed),
        ),
    };
}

export function parseConfig(input: unknown): AgentchatConfig {
    return normalizeParsedConfig(AgentchatConfigInputSchema.parse(input));
}

export function loadConfigFile(
    configPath = resolveDefaultConfigPath(),
): AgentchatConfig {
    const raw = readFileSync(configPath, "utf8");
    return normalizeParsedConfig(
        AgentchatConfigInputSchema.parse(JSON.parse(raw) as unknown),
        { configPath },
    );
}

export class ConfigStore {
    #configPath: string;
    #config: AgentchatConfig;
    #status: ConfigStoreStatus;

    constructor(configPath = resolveDefaultConfigPath()) {
        this.#configPath = configPath;
        this.#config = loadConfigFile(configPath);
        this.#status = {
            loadedAt: Date.now(),
            lastReloadAttemptAt: null,
            lastReloadError: null,
        };
    }

    get path(): string {
        return this.#configPath;
    }

    get snapshot(): AgentchatConfig {
        return this.#config;
    }

    get status(): ConfigStoreStatus {
        return this.#status;
    }

    reloadNow(attemptedAt = Date.now()): void {
        try {
            this.#config = loadConfigFile(this.#configPath);
            this.#status = {
                loadedAt: attemptedAt,
                lastReloadAttemptAt: attemptedAt,
                lastReloadError: null,
            };
            console.log(
                `[agentchat-server] reloaded config from ${this.#configPath}`,
            );
        } catch (error) {
            this.#status = {
                ...this.#status,
                lastReloadAttemptAt: attemptedAt,
                lastReloadError:
                    error instanceof Error ? error.message : String(error),
            };
            console.error(
                `[agentchat-server] failed to reload config from ${this.#configPath}; keeping last known good config`,
                error,
            );
        }
    }

    watch(): void {
        watch(this.#configPath, { persistent: false }, () => {
            this.reloadNow();
        });
    }
}
