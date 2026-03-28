import net from "node:net";
import path from "node:path";
import fs from "node:fs";

import type { LocalManifest, ManagedService, ServiceName } from "./model.ts";
import {
    ensureProcessRegistryFile,
    loadProcessRegistry,
    updateProcessRegistry,
    upsertManagedService,
} from "./registry.ts";
import { ensureDir, nowIso } from "./util.ts";

const START_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 200;

type ProcessSnapshot = {
    argv: string[] | null;
    startToken: string | null;
};

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

function normalizeCommandPart(part: string): string {
    if (!part) {
        return part;
    }

    if (part.includes(path.sep)) {
        return path.basename(part);
    }

    return part;
}

function isCommandSubsequence(
    expectedCommand: string[],
    actualArgv: string[] | null,
): boolean {
    if (!actualArgv || actualArgv.length === 0) {
        return false;
    }

    const expected = expectedCommand.map(normalizeCommandPart);
    const actual = actualArgv.map(normalizeCommandPart);
    let actualIndex = 0;

    for (const expectedPart of expected) {
        while (
            actualIndex < actual.length &&
            actual[actualIndex] !== expectedPart
        ) {
            actualIndex += 1;
        }
        if (actualIndex >= actual.length) {
            return false;
        }
        actualIndex += 1;
    }

    return true;
}

function readProcfsSnapshot(pid: number): ProcessSnapshot | null {
    try {
        const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
        const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
        const argv = cmdline
            .split("\0")
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        const statEnd = stat.lastIndexOf(")");
        if (statEnd === -1) {
            return { argv, startToken: null };
        }
        const fields = stat
            .slice(statEnd + 2)
            .trim()
            .split(/\s+/);
        const startTicks = fields[19] ?? null;
        return {
            argv,
            startToken: startTicks,
        };
    } catch {
        return null;
    }
}

function readPsOutput(
    pid: number,
    field: "command=" | "lstart=",
): string | null {
    const proc = Bun.spawnSync(["ps", "-o", field, "-p", String(pid)], {
        stdout: "pipe",
        stderr: "ignore",
    });
    if (proc.exitCode !== 0) {
        return null;
    }

    const output = proc.stdout.toString().trim();
    return output.length > 0 ? output : null;
}

function readPsSnapshot(pid: number): ProcessSnapshot | null {
    const commandLine = readPsOutput(pid, "command=");
    const startToken = readPsOutput(pid, "lstart=");
    if (!commandLine && !startToken) {
        return null;
    }

    return {
        argv: commandLine ? commandLine.split(/\s+/).filter(Boolean) : null,
        startToken,
    };
}

function readProcessSnapshot(pid: number): ProcessSnapshot | null {
    return readProcfsSnapshot(pid) ?? readPsSnapshot(pid);
}

function isManagedServiceOwned(service: ManagedService): boolean {
    const snapshot = readProcessSnapshot(service.pid);
    if (!snapshot) {
        return false;
    }

    if (!isCommandSubsequence(service.command, snapshot.argv)) {
        return false;
    }

    if (
        service.processStartToken &&
        snapshot.startToken &&
        service.processStartToken !== snapshot.startToken
    ) {
        return false;
    }

    return true;
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

async function terminateServiceProcess(service: ManagedService): Promise<void> {
    if (!isManagedServiceOwned(service)) {
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
        isManagedServiceOwned(service),
    );
}

export async function startManagedServices(
    manifest: LocalManifest,
): Promise<ManagedService[]> {
    ensureProcessRegistryFile();
    const currentServices = listCurrentCheckoutServices(manifest);
    const existingServices = currentServices.filter((service) =>
        isManagedServiceOwned(service),
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
            .filter((service) => !isManagedServiceOwned(service))
            .map((service) => service.sessionId),
    );
    if (staleIds.size > 0) {
        updateProcessRegistry((registry) => ({
            ...registry,
            services: registry.services.filter(
                (service) => !staleIds.has(service.sessionId),
            ),
        }));
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
                processStartToken: readProcessSnapshot(pid)?.startToken ?? null,
                logPath,
                ports: [port],
                state: "running",
                startedAt: nowIso(),
                updatedAt: nowIso(),
            };
            updateProcessRegistry((registry) =>
                upsertManagedService(registry, record),
            );
            startedServices.push(record);
        }
    } catch (error) {
        for (const service of startedServices) {
            await terminateServiceProcess(service);
        }
        throw error;
    }

    return startedServices;
}

export async function stopManagedServices(
    manifest: LocalManifest,
): Promise<ManagedService[]> {
    ensureProcessRegistryFile();
    const services = listCurrentCheckoutServices(manifest);
    if (services.length === 0) {
        return [];
    }

    for (const service of services) {
        await terminateServiceProcess(service);
    }

    const sessionIds = new Set(services.map((service) => service.sessionId));
    updateProcessRegistry((registry) => ({
        ...registry,
        services: registry.services.filter(
            (service) => !sessionIds.has(service.sessionId),
        ),
    }));
    return services;
}
