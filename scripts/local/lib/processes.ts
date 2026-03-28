import net from "node:net";
import path from "node:path";

import type { LocalManifest, ManagedService, ServiceName } from "./model.ts";
import {
    ensureProcessRegistryFile,
    loadProcessRegistry,
    saveProcessRegistry,
    upsertManagedService,
} from "./registry.ts";
import { ensureDir, nowIso } from "./util.ts";

const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 200;

function commandForService(service: ServiceName): string[] {
    switch (service) {
        case "web":
            return ["bun", "run", "--cwd", "apps/web", "dev"];
        case "server":
            return ["bun", "run", "--cwd", "apps/server", "dev"];
    }
}

function shellCommandForService(service: ServiceName): string {
    const command = commandForService(service)
        .map((part) => `'${part.replaceAll("'", "'\''")}'`)
        .join(" ");
    return `exec ${command} >> "$AGENTCHAT_LOG_PATH" 2>&1`;
}

function logPathForService(
    manifest: LocalManifest,
    service: ServiceName,
): string {
    return path.join(manifest.logDir, `${service}.log`);
}

function portForService(manifest: LocalManifest, service: ServiceName): number {
    return service === "web" ? manifest.webPort : manifest.serverPort;
}

function envForService(
    manifest: LocalManifest,
    service: ServiceName,
    logPath: string,
): Record<string, string> {
    const base: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
            ),
        ),
        AGENTCHAT_LOG_PATH: logPath,
    };

    if (service === "web") {
        base.HOST = manifest.managedEnv.web.host;
        base.PORT = String(manifest.webPort);
        base.NEXT_PUBLIC_AGENTCHAT_SERVER_URL = manifest.serverUrl;
        if (manifest.managedEnv.web.nextPublicConvexUrl) {
            base.NEXT_PUBLIC_CONVEX_URL =
                manifest.managedEnv.web.nextPublicConvexUrl;
        }
        if (manifest.managedEnv.web.nextAllowedDevOrigins) {
            base.NEXT_ALLOWED_DEV_ORIGINS =
                manifest.managedEnv.web.nextAllowedDevOrigins;
        }
    } else {
        base.HOST = manifest.managedEnv.server.host;
        base.PORT = String(manifest.serverPort);
        base.XDG_STATE_HOME = manifest.xdgStateHome;
        base.BACKEND_TOKEN_SECRET =
            manifest.managedEnv.server.backendTokenSecret;
        base.AGENTCHAT_CONVEX_SITE_URL =
            manifest.managedEnv.server.agentchatConvexSiteUrl;
        base.RUNTIME_INGRESS_SECRET =
            manifest.managedEnv.server.runtimeIngressSecret;
    }

    return base;
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const open = await new Promise<boolean>((resolve) => {
            const socket = net.connect({ host: "127.0.0.1", port });
            socket.once("connect", () => {
                socket.destroy();
                resolve(true);
            });
            socket.once("error", () => {
                socket.destroy();
                resolve(false);
            });
        });
        if (open) {
            return true;
        }
        await Bun.sleep(POLL_INTERVAL_MS);
    }
    return false;
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (!isProcessAlive(pid)) {
            return true;
        }
        await Bun.sleep(POLL_INTERVAL_MS);
    }
    return !isProcessAlive(pid);
}

async function terminateServiceProcess(
    service: Pick<ManagedService, "pid" | "pgid">,
): Promise<void> {
    if (!isProcessAlive(service.pid)) {
        return;
    }

    try {
        process.kill(-service.pgid, "SIGTERM");
    } catch {
        try {
            process.kill(service.pid, "SIGTERM");
        } catch {
            return;
        }
    }

    const exited = await waitForExit(service.pid, STOP_TIMEOUT_MS);
    if (exited) {
        return;
    }

    try {
        process.kill(-service.pgid, "SIGKILL");
    } catch {
        try {
            process.kill(service.pid, "SIGKILL");
        } catch {
            return;
        }
    }
    await waitForExit(service.pid, 1_000);
}

function listCurrentCheckoutServices(
    manifest: LocalManifest,
): ManagedService[] {
    return loadProcessRegistry().services.filter(
        (service) =>
            service.laneId === manifest.laneId &&
            path.resolve(service.checkoutPath) ===
                path.resolve(manifest.checkoutPath),
    );
}

export function summarizeCurrentCheckoutServices(
    manifest: LocalManifest,
): ManagedService[] {
    return listCurrentCheckoutServices(manifest).filter((service) =>
        isProcessAlive(service.pid),
    );
}

export async function startManagedServices(
    manifest: LocalManifest,
): Promise<ManagedService[]> {
    ensureProcessRegistryFile();
    let registry = loadProcessRegistry();
    const currentServices = listCurrentCheckoutServices(manifest);
    const existingServices = currentServices.filter((service) =>
        isProcessAlive(service.pid),
    );
    if (existingServices.length > 0) {
        const labels = existingServices
            .map((service) => `${service.service}(${service.pid})`)
            .join(", ");
        throw new Error(
            `Managed services are already running for this checkout: ${labels}. Run bun run stop first if you need to restart them.`,
        );
    }

    const staleIds = new Set(
        currentServices
            .filter((service) => !isProcessAlive(service.pid))
            .map((service) => service.sessionId),
    );
    if (staleIds.size > 0) {
        registry = {
            ...registry,
            services: registry.services.filter(
                (service) => !staleIds.has(service.sessionId),
            ),
        };
    }

    const sessionId = `${manifest.laneId}-${Date.now()}`;
    const startedServices: ManagedService[] = [];

    try {
        for (const service of ["server", "web"] as const) {
            const command = commandForService(service);
            const logPath = logPathForService(manifest, service);
            ensureDir(path.dirname(logPath));
            const subprocess = Bun.spawn({
                cmd: ["sh", "-lc", shellCommandForService(service)],
                cwd: manifest.checkoutPath,
                env: envForService(manifest, service, logPath),
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
                detached: true,
            });

            const pid = subprocess.pid;
            const port = portForService(manifest, service);
            await Promise.race([
                waitForPort(port, START_TIMEOUT_MS).then((ready) => {
                    if (!ready) {
                        throw new Error(
                            `${service} did not start listening on port ${port} within ${START_TIMEOUT_MS}ms. Check ${logPath}.`,
                        );
                    }
                }),
                subprocess.exited.then((code) => {
                    throw new Error(
                        `${service} exited during startup with code ${code}. Check ${logPath}.`,
                    );
                }),
            ]).finally(() => {
                subprocess.unref();
            });

            const record: ManagedService = {
                laneId: manifest.laneId,
                laneType: manifest.laneType,
                sessionId,
                service,
                checkoutPath: manifest.checkoutPath,
                cwd: manifest.checkoutPath,
                pid,
                pgid: pid,
                command,
                logPath,
                ports: [port],
                state: "running",
                startedAt: nowIso(),
                updatedAt: nowIso(),
            };
            registry = upsertManagedService(registry, record);
            startedServices.push(record);
        }
    } catch (error) {
        for (const service of startedServices) {
            await terminateServiceProcess(service);
        }
        throw error;
    }

    saveProcessRegistry(registry);
    return startedServices;
}

export async function stopManagedServices(
    manifest: LocalManifest,
): Promise<ManagedService[]> {
    ensureProcessRegistryFile();
    let registry = loadProcessRegistry();
    const services = listCurrentCheckoutServices(manifest);
    if (services.length === 0) {
        return [];
    }

    for (const service of services) {
        await terminateServiceProcess(service);
    }

    const sessionIds = new Set(services.map((service) => service.sessionId));
    registry = {
        ...registry,
        services: registry.services.filter(
            (service) => !sessionIds.has(service.sessionId),
        ),
    };
    saveProcessRegistry(registry);
    return services;
}
