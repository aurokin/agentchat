import { existsSync, readFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

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

const LegacyGoogleAuthConfigSchema = z.object({
    mode: z.literal("google"),
    allowlistMode: z.literal("email"),
    allowedEmails: z.array(z.email()),
    allowedDomains: z.array(z.string()),
    googleHostedDomain: z.union([z.string(), z.null()]),
});

const LegacyAuthConfigSchema = z.discriminatedUnion("mode", [
    LegacyGoogleAuthConfigSchema,
]);

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

const CodexProviderSchema = z.object({
    id: z.string().min(1),
    kind: z.literal("codex"),
    label: z.string().min(1),
    enabled: z.boolean(),
    idleTtlSeconds: z.number().int().positive(),
    modelCacheTtlSeconds: z.number().int().positive(),
    models: z.array(ProviderModelSchema).default([]),
    codex: z.object({
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        baseEnv: z.record(z.string(), z.string()),
        cwd: z.string().min(1).optional(),
    }),
});

const AgentSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().optional(),
        avatar: z.union([z.string(), z.null()]).optional(),
        enabled: z.boolean(),
        rootPath: z.string().min(1),
        providerIds: z.array(z.string().min(1)).min(1),
        defaultProviderId: z.string().min(1),
        defaultModel: z.string().min(1).optional(),
        defaultVariant: z.string().min(1).optional(),
        defaultVisible: z.boolean().default(true),
        visibilityOverrides: z.array(z.string().min(1)).default([]),
        modelAllowlist: z.array(z.string()).default([]),
        variantAllowlist: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        sortOrder: z.number().int().default(0),
    })
    .superRefine((agent, ctx) => {
        if (!path.isAbsolute(agent.rootPath)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Agent '${agent.id}' rootPath must be absolute.`,
            });
        }

        if (!agent.providerIds.includes(agent.defaultProviderId)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Agent '${agent.id}' defaultProviderId must exist in providerIds.`,
            });
        }
    });

const AgentchatConfigInputSchema = z
    .object({
        version: z.literal(1),
        auth: z.union([ProviderAuthConfigSchema, LegacyAuthConfigSchema]),
        providers: z.array(CodexProviderSchema),
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

            if (provider.codex.cwd && !path.isAbsolute(provider.codex.cwd)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Provider '${provider.id}' codex.cwd must be absolute.`,
                });
            }
        }

        const agentIds = new Set<string>();
        for (const agent of config.agents) {
            if (agentIds.has(agent.id)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Duplicate agent id '${agent.id}'.`,
                });
            }
            agentIds.add(agent.id);

            for (const providerId of agent.providerIds) {
                if (!providerIds.has(providerId)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Agent '${agent.id}' references unknown provider '${providerId}'.`,
                    });
                }
            }
        }
    });

export type AuthProviderConfig = z.infer<typeof AuthProviderSchema>;
export type AuthConfig = z.infer<typeof ProviderAuthConfigSchema>;
export type AgentchatConfig = Omit<
    z.infer<typeof AgentchatConfigInputSchema>,
    "auth"
> & {
    auth: AuthConfig;
};
export type AgentConfig = AgentchatConfig["agents"][number];
export type ProviderConfig = AgentchatConfig["providers"][number];
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

function normalizeAuthConfig(
    auth:
        | z.infer<typeof ProviderAuthConfigSchema>
        | z.infer<typeof LegacyAuthConfigSchema>,
): AuthConfig {
    if ("providers" in auth) {
        return auth;
    }

    return {
        defaultProviderId: "google-main",
        providers: [
            {
                id: "google-main",
                kind: "google",
                enabled: true,
                allowlistMode: auth.allowlistMode,
                allowedEmails: auth.allowedEmails,
                allowedDomains: auth.allowedDomains,
                googleHostedDomain: auth.googleHostedDomain,
            },
        ],
    };
}

export function parseConfig(input: unknown): AgentchatConfig {
    const parsed = AgentchatConfigInputSchema.parse(input);
    return {
        ...parsed,
        auth: normalizeAuthConfig(parsed.auth),
    };
}

export function loadConfigFile(
    configPath = resolveDefaultConfigPath(),
): AgentchatConfig {
    const raw = readFileSync(configPath, "utf8");
    return parseConfig(JSON.parse(raw) as unknown);
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
