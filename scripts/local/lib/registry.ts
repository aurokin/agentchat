import fs from "node:fs";
import path from "node:path";

import {
    HOST_PORT_LEASES_PATH,
    HOST_PROCESS_REGISTRY_PATH,
    HOST_REGISTRY_PATH,
    STABLE_CHECKOUT_PATH,
} from "./constants.ts";
import type {
    HostConfig,
    HostRegistry,
    ManagedService,
    PortLease,
    PortLeases,
    ProcessRegistry,
} from "./model.ts";
import { nowIso, readJsonIfExists, writeJson } from "./util.ts";

const FILE_LOCK_STALE_MS = 5_000;
const FILE_LOCK_WAIT_MS = 5_000;
const FILE_LOCK_POLL_MS = 10;
const lockSleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(ms: number): void {
    try {
        Atomics.wait(lockSleepBuffer, 0, 0, ms);
    } catch {
        const deadline = Date.now() + ms;
        while (Date.now() < deadline) {
            // Busy-wait fallback.
        }
    }
}

function isAlreadyExistsError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "EEXIST"
    );
}

function withFileLock<T>(lockPath: string, run: () => T): T {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const deadline = Date.now() + FILE_LOCK_WAIT_MS;

    for (;;) {
        try {
            fs.mkdirSync(lockPath);
            break;
        } catch (error) {
            if (!isAlreadyExistsError(error)) {
                throw error;
            }

            try {
                if (
                    Date.now() - fs.lstatSync(lockPath).mtimeMs >=
                    FILE_LOCK_STALE_MS
                ) {
                    fs.rmSync(lockPath, { recursive: true, force: true });
                    continue;
                }
            } catch {
                continue;
            }

            if (Date.now() >= deadline) {
                throw new Error(
                    `Timed out acquiring file lock for ${lockPath}`,
                );
            }

            sleepSync(FILE_LOCK_POLL_MS);
        }
    }

    try {
        return run();
    } finally {
        fs.rmSync(lockPath, { recursive: true, force: true });
    }
}

function processRegistryLockPath(): string {
    return `${HOST_PROCESS_REGISTRY_PATH}.lock`;
}

function portLeasesLockPath(): string {
    return `${HOST_PORT_LEASES_PATH}.lock`;
}

export function loadHostRegistry(hostConfig?: HostConfig): HostRegistry {
    return (
        readJsonIfExists<HostRegistry>(HOST_REGISTRY_PATH) ?? {
            version: 1,
            stableCheckoutPath:
                hostConfig?.stableCheckoutPath ?? STABLE_CHECKOUT_PATH,
            stableConvexSiteUrl: null,
            stableConvexCloudUrl: null,
            updatedAt: nowIso(),
        }
    );
}

export function saveHostRegistry(registry: HostRegistry): void {
    writeJson(HOST_REGISTRY_PATH, {
        ...registry,
        updatedAt: nowIso(),
    });
}

export function loadPortLeases(): PortLeases {
    return (
        readJsonIfExists<PortLeases>(HOST_PORT_LEASES_PATH) ?? {
            version: 1,
            leases: [],
        }
    );
}

export function savePortLeases(portLeases: PortLeases): void {
    writeJson(HOST_PORT_LEASES_PATH, portLeases);
}

export function updatePortLeases(
    mutator: (portLeases: PortLeases) => PortLeases,
): PortLeases {
    return withFileLock(portLeasesLockPath(), () => {
        const next = mutator(loadPortLeases());
        savePortLeases(next);
        return next;
    });
}

export function loadProcessRegistry(): ProcessRegistry {
    return (
        readJsonIfExists<ProcessRegistry>(HOST_PROCESS_REGISTRY_PATH) ?? {
            version: 1,
            services: [],
        }
    );
}

export function saveProcessRegistry(processRegistry: ProcessRegistry): void {
    writeJson(HOST_PROCESS_REGISTRY_PATH, processRegistry);
}

export function updateProcessRegistry(
    mutator: (processRegistry: ProcessRegistry) => ProcessRegistry,
): ProcessRegistry {
    return withFileLock(processRegistryLockPath(), () => {
        const next = mutator(loadProcessRegistry());
        saveProcessRegistry(next);
        return next;
    });
}

export function ensureProcessRegistryFile(): void {
    if (fs.existsSync(HOST_PROCESS_REGISTRY_PATH)) {
        return;
    }

    saveProcessRegistry({
        version: 1,
        services: [],
    });
}

export function resolveLeaseConflict(
    leases: PortLeases,
    params: {
        port: number;
        service: "web" | "server";
        laneId: string;
        checkoutPath: string;
    },
): PortLease | null {
    return (
        leases.leases.find(
            (lease) =>
                lease.port === params.port &&
                lease.service === params.service &&
                !(
                    lease.laneId === params.laneId &&
                    path.resolve(lease.checkoutPath) ===
                        path.resolve(params.checkoutPath)
                ),
        ) ?? null
    );
}

export function upsertLease(
    leases: PortLeases,
    params: {
        port: number;
        service: "web" | "server";
        laneId: string;
        checkoutPath: string;
    },
): PortLeases {
    const filtered = leases.leases.filter(
        (lease) =>
            !(
                lease.service === params.service &&
                lease.laneId === params.laneId &&
                path.resolve(lease.checkoutPath) ===
                    path.resolve(params.checkoutPath)
            ),
    );

    filtered.push({
        laneId: params.laneId,
        checkoutPath: params.checkoutPath,
        service: params.service,
        port: params.port,
        updatedAt: nowIso(),
    });

    return {
        ...leases,
        leases: filtered.sort((left, right) => left.port - right.port),
    };
}

export function removeLeasesForCheckout(
    leases: PortLeases,
    checkoutPath: string,
): PortLeases {
    const resolved = path.resolve(checkoutPath);
    return {
        ...leases,
        leases: leases.leases.filter(
            (lease) => path.resolve(lease.checkoutPath) !== resolved,
        ),
    };
}

export function upsertManagedService(
    registry: ProcessRegistry,
    service: ManagedService,
): ProcessRegistry {
    const filtered = registry.services.filter(
        (entry) =>
            !(
                entry.sessionId === service.sessionId &&
                entry.service === service.service
            ),
    );

    filtered.push({
        ...service,
        updatedAt: nowIso(),
    });

    return {
        ...registry,
        services: filtered.sort((left, right) =>
            left.service.localeCompare(right.service),
        ),
    };
}

export function removeManagedServicesForCheckout(
    registry: ProcessRegistry,
    checkoutPath: string,
): ProcessRegistry {
    const resolved = path.resolve(checkoutPath);
    return {
        ...registry,
        services: registry.services.filter(
            (service) => path.resolve(service.checkoutPath) !== resolved,
        ),
    };
}
