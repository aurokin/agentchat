import os from "node:os";
import path from "node:path";

import {
    DEFAULT_DEV_SERVER_PORT,
    DEFAULT_DEV_WEB_PORT,
    DEV_PORT_SPAN,
    HOST_CONFIG_PATH,
    HOST_PORT_LEASES_PATH,
    HOST_PROCESS_REGISTRY_PATH,
    HOST_REGISTRY_PATH,
    LOCAL_MANIFEST_PATH,
} from "./constants.ts";
import type {
    HostConfig,
    HostRegistry,
    LocalManifest,
    ManagedServerEnv,
    ManagedWebEnv,
} from "./model.ts";
import {
    hashShort,
    isRecord,
    nowIso,
    readJsonIfExists,
    sanitizeLabel,
    writeJson,
} from "./util.ts";

export function resolveManifestPath(checkoutPath = process.cwd()): string {
    return path.join(checkoutPath, LOCAL_MANIFEST_PATH);
}

export function loadLocalManifest(
    checkoutPath = process.cwd(),
): LocalManifest | null {
    const manifestPath = resolveManifestPath(checkoutPath);
    const value = readJsonIfExists<LocalManifest>(manifestPath);
    if (!value) {
        return null;
    }
    if (
        !isRecord(value) ||
        value.manifestVersion !== 1 ||
        typeof value.laneId !== "string" ||
        typeof value.checkoutPath !== "string" ||
        typeof value.webPort !== "number" ||
        typeof value.serverPort !== "number" ||
        !isRecord(value.generatedFiles) ||
        typeof value.generatedFiles.webEnvPath !== "string" ||
        typeof value.generatedFiles.serverEnvPath !== "string" ||
        typeof value.generatedFiles.serverConfigPath !== "string" ||
        !isRecord(value.managedEnv) ||
        !isRecord(value.managedEnv.web) ||
        !isRecord(value.managedEnv.server)
    ) {
        throw new Error(`Invalid local manifest at ${manifestPath}.`);
    }
    return value;
}

export function tryLoadLocalManifest(
    checkoutPath = process.cwd(),
    params?: { onError?: (error: Error) => void },
): LocalManifest | null {
    try {
        return loadLocalManifest(checkoutPath);
    } catch (error) {
        if (error instanceof Error) {
            params?.onError?.(error);
        }
        return null;
    }
}

export function saveLocalManifest(manifest: LocalManifest): void {
    writeJson(resolveManifestPath(manifest.checkoutPath), {
        ...manifest,
        updatedAt: nowIso(),
    });
}

export function deriveLanePorts(checkoutPath: string): {
    webPort: number;
    serverPort: number;
} {
    const slot =
        Number.parseInt(hashShort(path.resolve(checkoutPath)).slice(0, 8), 16) %
        DEV_PORT_SPAN;

    return {
        webPort: DEFAULT_DEV_WEB_PORT + slot,
        serverPort: DEFAULT_DEV_SERVER_PORT + slot,
    };
}

export function deriveLaneId(checkoutPath: string): string {
    const base = sanitizeLabel(path.basename(checkoutPath));
    return `dev-${base}-${hashShort(path.resolve(checkoutPath))}`;
}

export function deriveLaneStateRoot(checkoutPath: string): string {
    return path.join(
        os.homedir(),
        ".local",
        "state",
        "agentchat",
        "lanes",
        deriveLaneId(checkoutPath),
    );
}

export function laneStateRootsForCheckout(
    checkoutPath: string,
    manifest: LocalManifest | null = null,
): string[] {
    const roots = new Set<string>([deriveLaneStateRoot(checkoutPath)]);
    if (manifest) {
        roots.add(path.dirname(manifest.xdgStateHome));
    }
    return [...roots];
}

export function buildDevManifest(params: {
    checkoutPath: string;
    convexDeployment: string | null;
    convexCloudUrl: string | null;
    convexSiteUrl: string | null;
    managedWebEnv: ManagedWebEnv;
    managedServerEnv: ManagedServerEnv;
    serverConfig: Record<string, unknown>;
}): LocalManifest {
    const checkoutPath = path.resolve(params.checkoutPath);
    const laneId = deriveLaneId(checkoutPath);
    const laneStateRoot = deriveLaneStateRoot(checkoutPath);
    const { webPort, serverPort } = deriveLanePorts(checkoutPath);

    return {
        manifestVersion: 1,
        laneType: "dev",
        laneId,
        checkoutPath,
        webPort,
        serverPort,
        webUrl: `http://localhost:${webPort}`,
        serverUrl: `http://localhost:${serverPort}`,
        convexMode: params.convexDeployment ? "external-dev" : "unconfigured",
        convexDeployment: params.convexDeployment,
        convexCloudUrl: params.convexCloudUrl,
        convexSiteUrl: params.convexSiteUrl,
        xdgStateHome: path.join(laneStateRoot, "xdg"),
        sandboxRoot: path.join(laneStateRoot, "sandboxes"),
        stateId: `${laneId}-state`,
        logDir: path.join(laneStateRoot, "logs"),
        managedEnv: {
            web: params.managedWebEnv,
            server: params.managedServerEnv,
        },
        serverConfig: params.serverConfig,
        generatedFiles: {
            webEnvPath: path.join(checkoutPath, "apps/web/.env.local"),
            serverEnvPath: path.join(checkoutPath, "apps/server/.env.local"),
            serverConfigPath: path.join(
                checkoutPath,
                "apps/server/agentchat.config.json",
            ),
        },
        updatedAt: nowIso(),
    };
}

export function buildConfigPrintPayload(params: {
    manifest: LocalManifest | null;
    registry: HostRegistry;
    hostConfig: HostConfig;
    checkoutPath: string;
}) {
    return {
        checkoutPath: path.resolve(params.checkoutPath),
        manifest: params.manifest,
        hostConfig: {
            path: HOST_CONFIG_PATH,
            values: params.hostConfig,
        },
        hostRegistry: {
            path: HOST_REGISTRY_PATH,
            portLeasesPath: HOST_PORT_LEASES_PATH,
            processRegistryPath: HOST_PROCESS_REGISTRY_PATH,
            stableCheckoutPath: params.registry.stableCheckoutPath,
            stableConvexSiteUrl: params.registry.stableConvexSiteUrl,
            stableConvexCloudUrl: params.registry.stableConvexCloudUrl,
        },
    };
}
