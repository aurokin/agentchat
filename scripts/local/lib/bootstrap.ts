import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import { loadDotEnvIfExists, parseDotEnvFile } from "../../env/lib.ts";
import { HOST_PROCESS_REGISTRY_PATH } from "./constants.ts";
import {
    buildDevManifest,
    loadLocalManifest,
    saveLocalManifest,
} from "./manifest.ts";
import { loadHostConfig } from "./hostConfig.ts";
import type {
    BootstrapContext,
    LocalManifest,
    ManagedServerEnv,
    ManagedWebEnv,
} from "./model.ts";
import {
    ensureProcessRegistryFile,
    loadHostRegistry,
    loadPortLeases,
    resolveLeaseConflict,
    updateHostRegistry,
    updatePortLeases,
    upsertLease,
} from "./registry.ts";
import { renderGeneratedFiles } from "./render.ts";
import {
    diffText,
    fileContents,
    hasFlag,
    isStableCheckout,
    relativeToRepo,
    writeText,
} from "./util.ts";

export function maybeRunInstall(): void {
    if (hasFlag("--no-install")) {
        return;
    }

    const nodeModulesPath = path.join(process.cwd(), "node_modules");
    if (fs.existsSync(nodeModulesPath)) {
        return;
    }

    const proc = Bun.spawnSync(["bun", "install"], {
        cwd: process.cwd(),
        stdout: "inherit",
        stderr: "inherit",
    });
    if (proc.exitCode !== 0) {
        throw new Error("bun install failed while bootstrapping the checkout.");
    }
}

function toDeploymentName(value: string | undefined): string | null {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const separator = trimmed.indexOf(":");
    return separator === -1 ? trimmed : trimmed.slice(separator + 1);
}

function resolveManagedHost(
    value: string | undefined,
    defaultHost: string,
): string {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === "0.0.0.0" || trimmed === "127.0.0.1") {
        return defaultHost;
    }
    return trimmed;
}

function normalizeManagedSecret(value: string | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed || trimmed === "replace-me") {
        return null;
    }
    return trimmed;
}

function parseJsonObject(absPath: string): Record<string, unknown> | null {
    if (!fs.existsSync(absPath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(absPath, "utf8")) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

function loadConvexInputs() {
    const hostConfig = loadHostConfig();
    const hostDevConvexEnv = loadDotEnvIfExists(hostConfig.dev.convexEnvPath);
    const rootConvexEnv = loadDotEnvIfExists(
        path.join(process.cwd(), ".env.convex.local"),
    );
    const convexCliEnv = loadDotEnvIfExists(
        path.join(process.cwd(), "packages/convex/.env.local"),
    );
    const webEnv = loadDotEnvIfExists(
        path.join(process.cwd(), "apps/web/.env.local"),
    );
    const serverEnv = loadDotEnvIfExists(
        path.join(process.cwd(), "apps/server/.env.local"),
    );

    const rawDeployment =
        hostDevConvexEnv.CONVEX_DEPLOYMENT?.trim() ??
        rootConvexEnv.CONVEX_DEPLOYMENT?.trim() ??
        convexCliEnv.CONVEX_DEPLOYMENT?.trim() ??
        null;
    if (rawDeployment && !rawDeployment.startsWith("dev:")) {
        throw new Error(
            "Dev bootstrap refuses non-dev Convex deployments. Configure a dev:* deployment for local wrappers.",
        );
    }

    const deploymentName = toDeploymentName(rawDeployment ?? undefined);
    const convexCloudUrl =
        webEnv.NEXT_PUBLIC_CONVEX_URL ??
        hostDevConvexEnv.CONVEX_URL?.trim() ??
        convexCliEnv.CONVEX_URL?.trim() ??
        (deploymentName ? `https://${deploymentName}.convex.cloud` : null);
    const convexSiteUrl =
        serverEnv.AGENTCHAT_CONVEX_SITE_URL ??
        (deploymentName ? `https://${deploymentName}.convex.site` : null);

    return {
        webEnv,
        serverEnv,
        convexDeployment: deploymentName,
        convexCloudUrl,
        convexSiteUrl,
    };
}

function buildDefaultServerConfig(
    checkoutPath: string,
): Record<string, unknown> {
    const exampleConfigPath = path.join(
        checkoutPath,
        "apps/server/agentchat.config.example.json",
    );
    const example = JSON.parse(
        fs.readFileSync(exampleConfigPath, "utf8"),
    ) as Record<string, unknown>;
    const providers =
        (example.providers as Array<Record<string, unknown>> | undefined) ?? [];
    const providerId =
        typeof providers[0]?.id === "string" ? providers[0].id : "codex-main";

    return {
        ...example,
        auth: {
            defaultProviderId: "local-main",
            providers: [
                {
                    id: "local-main",
                    kind: "local",
                    enabled: true,
                    allowSignup: false,
                },
            ],
        },
        providers: providers.map((provider) => ({
            ...provider,
            codex: {
                ...(provider.codex as Record<string, unknown>),
                cwd: checkoutPath,
            },
        })),
        agents: [
            {
                id: "current-checkout",
                name: "Current Checkout",
                description:
                    "Bootstrap-generated local agent rooted at the current checkout.",
                avatar: null,
                enabled: true,
                defaultVisible: true,
                visibilityOverrides: [],
                rootPath: checkoutPath,
                providerIds: [providerId],
                defaultProviderId: providerId,
                defaultModel: "gpt-5.4",
                defaultVariant: "low",
                modelAllowlist: [],
                variantAllowlist: [],
                workspaceMode: "copy-on-conversation",
                tags: ["local"],
                sortOrder: 10,
            },
        ],
    };
}

function buildManagedWebEnv(params: {
    convexCloudUrl: string | null;
    existingWebEnv: Record<string, string | undefined>;
    defaultHost: string;
}): ManagedWebEnv {
    return {
        host: resolveManagedHost(
            params.existingWebEnv.HOST,
            params.defaultHost,
        ),
        nextPublicConvexUrl:
            params.existingWebEnv.NEXT_PUBLIC_CONVEX_URL ??
            params.convexCloudUrl,
        nextAllowedDevOrigins:
            params.existingWebEnv.NEXT_ALLOWED_DEV_ORIGINS?.trim() || null,
    };
}

function buildManagedServerEnv(params: {
    convexSiteUrl: string | null;
    existingServerEnv: Record<string, string | undefined>;
    defaultHost: string;
}): ManagedServerEnv {
    return {
        host: resolveManagedHost(
            params.existingServerEnv.HOST,
            params.defaultHost,
        ),
        backendTokenSecret:
            normalizeManagedSecret(
                params.existingServerEnv.BACKEND_TOKEN_SECRET,
            ) || randomBytes(24).toString("base64url"),
        agentchatConvexSiteUrl:
            params.existingServerEnv.AGENTCHAT_CONVEX_SITE_URL?.trim() ||
            params.convexSiteUrl ||
            "https://example.convex.site",
        runtimeIngressSecret:
            normalizeManagedSecret(
                params.existingServerEnv.RUNTIME_INGRESS_SECRET,
            ) || randomBytes(24).toString("base64url"),
    };
}

function buildInitialManifest(): LocalManifest {
    const checkoutPath = process.cwd();
    const hostConfig = loadHostConfig();
    const convexInputs = loadConvexInputs();
    const existingWebEnv = loadDotEnvIfExists(
        path.join(checkoutPath, "apps/web/.env.local"),
    );
    const existingServerEnv = loadDotEnvIfExists(
        path.join(checkoutPath, "apps/server/.env.local"),
    );
    const existingServerConfig = parseJsonObject(
        path.join(checkoutPath, "apps/server/agentchat.config.json"),
    );

    return buildDevManifest({
        checkoutPath,
        convexDeployment: convexInputs.convexDeployment,
        convexCloudUrl: convexInputs.convexCloudUrl,
        convexSiteUrl: convexInputs.convexSiteUrl,
        managedWebEnv: buildManagedWebEnv({
            convexCloudUrl: convexInputs.convexCloudUrl,
            existingWebEnv,
            defaultHost: hostConfig.dev.defaultHost,
        }),
        managedServerEnv: buildManagedServerEnv({
            convexSiteUrl: convexInputs.convexSiteUrl,
            existingServerEnv,
            defaultHost: hostConfig.dev.defaultHost,
        }),
        serverConfig:
            existingServerConfig ?? buildDefaultServerConfig(checkoutPath),
    });
}

function assertSafeDevServerConfig(params: {
    checkoutPath: string;
    stableCheckoutPath: string;
    serverConfig: Record<string, unknown>;
}): void {
    const agents = params.serverConfig.agents;
    if (!Array.isArray(agents)) {
        return;
    }

    const checkoutPath = path.resolve(params.checkoutPath);
    const stableCheckoutPath = path.resolve(params.stableCheckoutPath);

    for (const agent of agents) {
        if (!agent || typeof agent !== "object" || Array.isArray(agent)) {
            continue;
        }

        const workspaceMode =
            typeof agent.workspaceMode === "string"
                ? agent.workspaceMode
                : "shared";
        const rootPath =
            typeof agent.rootPath === "string"
                ? path.resolve(agent.rootPath)
                : null;

        if (workspaceMode !== "copy-on-conversation") {
            throw new Error(
                "Dev bootstrap refuses shared or unsupported workspace modes. Use copy-on-conversation for wrapper-managed dev checkouts.",
            );
        }

        if (!rootPath) {
            continue;
        }

        const withinCheckout =
            rootPath === checkoutPath ||
            rootPath.startsWith(`${checkoutPath}${path.sep}`);
        if (!withinCheckout) {
            throw new Error(
                `Dev bootstrap refuses agent rootPath outside the current checkout: ${rootPath}.`,
            );
        }

        if (
            rootPath === stableCheckoutPath ||
            rootPath.startsWith(`${stableCheckoutPath}${path.sep}`)
        ) {
            throw new Error(
                "Dev bootstrap refuses rootPath overlap with the stable checkout.",
            );
        }
    }
}

function normalizePortCheckHost(host: string): string {
    const trimmed = host.trim().toLowerCase();
    if (!trimmed || trimmed === "localhost") {
        return "127.0.0.1";
    }
    return host;
}

async function isPortAvailableOnHost(
    host: string,
    port: number,
): Promise<boolean> {
    return await new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, normalizePortCheckHost(host));
    });
}

function ensureGeneratedFilesMatch(
    manifest: LocalManifest,
    generatedFiles: BootstrapContext["generatedFiles"],
): void {
    const currentFiles: Array<[string, string]> = [
        [manifest.generatedFiles.webEnvPath, generatedFiles.webEnv],
        [manifest.generatedFiles.serverEnvPath, generatedFiles.serverEnv],
        [manifest.generatedFiles.serverConfigPath, generatedFiles.serverConfig],
    ];

    for (const [absPath, expected] of currentFiles) {
        const actual = fileContents(absPath);
        if (actual === null) {
            continue;
        }

        if (diffText(expected, actual)) {
            throw new Error(
                [
                    `Refusing to overwrite drifted generated file ${relativeToRepo(absPath)}.`,
                    "Use --adopt to import an existing local setup into the manifest model, or --force to overwrite it.",
                ].join(" "),
            );
        }
    }
}

async function assertDesiredPortsAvailable(
    manifest: LocalManifest,
): Promise<void> {
    const leases = loadPortLeases();
    const desiredPorts: Array<[number, "web" | "server"]> = [
        [manifest.webPort, "web"],
        [manifest.serverPort, "server"],
    ];

    for (const [port, service] of desiredPorts) {
        const conflict = resolveLeaseConflict(leases, {
            port,
            service,
            laneId: manifest.laneId,
            checkoutPath: manifest.checkoutPath,
        });
        if (conflict) {
            throw new Error(
                `Port ${port} is already leased to ${conflict.checkoutPath} (${conflict.service}).`,
            );
        }

        const bindHost =
            service === "web"
                ? manifest.managedEnv.web.host
                : manifest.managedEnv.server.host;
        if (!(await isPortAvailableOnHost(bindHost, port))) {
            throw new Error(
                `Preferred ${service} port ${port} is already in use on ${bindHost}. Reassignment is not automatic in this slice.`,
            );
        }
    }
}

export async function prepareBootstrapContext(): Promise<BootstrapContext> {
    const checkoutPath = process.cwd();
    const hostConfig = loadHostConfig();
    const registry = loadHostRegistry(hostConfig);

    if (isStableCheckout(checkoutPath, hostConfig.stableCheckoutPath)) {
        throw new Error(
            "This checkout is reserved for the stable installation. Use scripts/host/install-stable.sh or the documented stable host install procedure.",
        );
    }

    const adopt = hasFlag("--adopt");
    const force = hasFlag("--force");
    const manifest = adopt
        ? buildInitialManifest()
        : (loadLocalManifest(checkoutPath) ?? buildInitialManifest());
    assertSafeDevServerConfig({
        checkoutPath,
        stableCheckoutPath: hostConfig.stableCheckoutPath,
        serverConfig: manifest.serverConfig,
    });

    const generatedFiles = await renderGeneratedFiles({
        manifest,
    });

    if (!force && !adopt) {
        ensureGeneratedFilesMatch(manifest, generatedFiles);
    }

    await assertDesiredPortsAvailable(manifest);

    return {
        manifest,
        generatedFiles,
        registry,
        leases: loadPortLeases(),
    };
}

export function persistBootstrapContext(context: BootstrapContext): void {
    updateHostRegistry(() => context.registry);
    ensureProcessRegistryFile();

    updatePortLeases((leases) => {
        for (const [port, service] of [
            [context.manifest.webPort, "web"],
            [context.manifest.serverPort, "server"],
        ] as const) {
            const conflict = resolveLeaseConflict(leases, {
                port,
                service,
                laneId: context.manifest.laneId,
                checkoutPath: context.manifest.checkoutPath,
            });
            if (conflict) {
                throw new Error(
                    `Port ${port} is already leased to ${conflict.checkoutPath} (${conflict.service}).`,
                );
            }
        }

        let next = upsertLease(leases, {
            port: context.manifest.webPort,
            service: "web",
            laneId: context.manifest.laneId,
            checkoutPath: context.manifest.checkoutPath,
        });
        next = upsertLease(next, {
            port: context.manifest.serverPort,
            service: "server",
            laneId: context.manifest.laneId,
            checkoutPath: context.manifest.checkoutPath,
        });
        return next;
    });

    saveLocalManifest(context.manifest);
    writeText(
        context.manifest.generatedFiles.webEnvPath,
        context.generatedFiles.webEnv,
    );
    writeText(
        context.manifest.generatedFiles.serverEnvPath,
        context.generatedFiles.serverEnv,
    );
    writeText(
        context.manifest.generatedFiles.serverConfigPath,
        context.generatedFiles.serverConfig,
    );
}

export function buildDoctorReport(
    context: BootstrapContext | null,
    issue: string | null,
): {
    ok: boolean;
    checks: Array<{ label: string; ok: boolean; detail: string }>;
} {
    if (issue) {
        return {
            ok: false,
            checks: [
                {
                    label: "wrapper",
                    ok: false,
                    detail: issue,
                },
            ],
        };
    }

    if (!context) {
        return {
            ok: false,
            checks: [
                {
                    label: "manifest",
                    ok: false,
                    detail: "Missing local manifest. Run bun run bootstrap first.",
                },
            ],
        };
    }

    const serverEnv = parseDotEnvFile(context.generatedFiles.serverEnv);
    const webEnv = parseDotEnvFile(context.generatedFiles.webEnv);
    const checks = [
        {
            label: "manifest",
            ok: true,
            detail: `${context.manifest.laneId} (${context.manifest.laneType})`,
        },
        {
            label: "ports",
            ok: true,
            detail: `web=${context.manifest.webPort}, server=${context.manifest.serverPort}`,
        },
        {
            label: "webEnv",
            ok: Boolean(webEnv.NEXT_PUBLIC_AGENTCHAT_SERVER_URL),
            detail:
                webEnv.NEXT_PUBLIC_AGENTCHAT_SERVER_URL ??
                "Missing NEXT_PUBLIC_AGENTCHAT_SERVER_URL",
        },
        {
            label: "convexCloudUrl",
            ok: Boolean(webEnv.NEXT_PUBLIC_CONVEX_URL),
            detail:
                webEnv.NEXT_PUBLIC_CONVEX_URL ??
                "Missing NEXT_PUBLIC_CONVEX_URL",
        },
        {
            label: "serverSecrets",
            ok:
                serverEnv.BACKEND_TOKEN_SECRET !== "replace-me" &&
                serverEnv.RUNTIME_INGRESS_SECRET !== "replace-me",
            detail:
                serverEnv.BACKEND_TOKEN_SECRET === "replace-me" ||
                serverEnv.RUNTIME_INGRESS_SECRET === "replace-me"
                    ? "Server secrets still use placeholders."
                    : "Server secrets are present.",
        },
        {
            label: "convexSiteUrl",
            ok:
                typeof serverEnv.AGENTCHAT_CONVEX_SITE_URL === "string" &&
                serverEnv.AGENTCHAT_CONVEX_SITE_URL !==
                    "https://example.convex.site",
            detail:
                serverEnv.AGENTCHAT_CONVEX_SITE_URL ??
                "Missing AGENTCHAT_CONVEX_SITE_URL",
        },
        {
            label: "processRegistry",
            ok: fs.existsSync(HOST_PROCESS_REGISTRY_PATH),
            detail: HOST_PROCESS_REGISTRY_PATH,
        },
    ];

    return {
        ok: checks.every((check) => check.ok),
        checks,
    };
}
