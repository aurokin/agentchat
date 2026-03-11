import { existsSync, readFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const AuthConfigSchema = z.object({
    allowlistMode: z.literal("email"),
    allowedEmails: z.array(z.email()),
    allowedDomains: z.array(z.string()),
    googleHostedDomain: z.union([z.string(), z.null()]),
});

const CodexProviderSchema = z.object({
    id: z.string().min(1),
    kind: z.literal("codex"),
    label: z.string().min(1),
    enabled: z.boolean(),
    idleTtlSeconds: z.number().int().positive(),
    modelCacheTtlSeconds: z.number().int().positive(),
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

const AgentchatConfigSchema = z
    .object({
        version: z.literal(1),
        auth: AuthConfigSchema,
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

export type AgentchatConfig = z.infer<typeof AgentchatConfigSchema>;
export type AgentConfig = AgentchatConfig["agents"][number];
export type ProviderConfig = AgentchatConfig["providers"][number];

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

export function parseConfig(input: unknown): AgentchatConfig {
    return AgentchatConfigSchema.parse(input);
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

    constructor(configPath = resolveDefaultConfigPath()) {
        this.#configPath = configPath;
        this.#config = loadConfigFile(configPath);
    }

    get path(): string {
        return this.#configPath;
    }

    get snapshot(): AgentchatConfig {
        return this.#config;
    }

    watch(): void {
        watch(this.#configPath, { persistent: false }, () => {
            try {
                this.#config = loadConfigFile(this.#configPath);
                console.log(
                    `[agentchat-server] reloaded config from ${this.#configPath}`,
                );
            } catch (error) {
                console.error(
                    `[agentchat-server] failed to reload config from ${this.#configPath}; keeping last known good config`,
                    error,
                );
            }
        });
    }
}
