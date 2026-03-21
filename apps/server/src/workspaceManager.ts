import {
    existsSync,
    lstatSync,
    mkdirSync,
    realpathSync,
    readFileSync,
    readdirSync,
    writeFileSync,
} from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentchatConfig, AgentConfig } from "./config.ts";
import {
    canonicalizePathForComparison,
    pathsOverlap,
} from "./pathComparison.ts";
import {
    getSandboxConversationPathSegment,
    getSandboxUserPathSegment,
    getSandboxWorkspacePath,
} from "./sandboxPaths.ts";
import {
    getDefaultAgentchatStateBasePath,
    getServerStateScopeKey,
    getStableStateKey,
    resolveDefaultStateId,
} from "./serverState.ts";

const SANDBOX_STATE_DIRECTORY_NAME = ".agentchat-state";
const SANDBOX_ROOTS_REGISTRY_DIRECTORY_NAME = "sandbox-roots";
const WORKSPACE_METADATA_DIRECTORY_NAME = "workspace-metadata";
const MANAGED_WORKSPACES_REGISTRY_NAME = "managed-workspaces.json";
const SANDBOX_ROOT_REGISTRY_HEARTBEAT_MS = 60_000;
const SANDBOX_ROOT_REGISTRY_INSTANCE_TTL_MS = 5 * 60_000;
const RECENT_WORKSPACE_TOUCH_TTL_MS = 5 * 60_000;

type WorkspaceMetadata = {
    sourceRootPath: string;
    state: "creating" | "ready";
};

type SandboxRootsRegistry = {
    roots: string[];
    activeInstances: Record<
        string,
        {
            rootPath: string;
            updatedAt: number;
        }
    >;
};

export function getSandboxStateRootPath(sandboxRoot: string): string {
    return path.join(
        canonicalizePathForComparison(sandboxRoot),
        SANDBOX_STATE_DIRECTORY_NAME,
    );
}

export function getSandboxRootsRegistryPath(stateId: string): string {
    return path.join(
        getDefaultAgentchatStateBasePath(),
        SANDBOX_STATE_DIRECTORY_NAME,
        SANDBOX_ROOTS_REGISTRY_DIRECTORY_NAME,
        `${getServerStateScopeKey(stateId)}.json`,
    );
}

export function getWorkspaceMetadataRootPath(sandboxRoot: string): string {
    return path.join(
        getSandboxStateRootPath(sandboxRoot),
        WORKSPACE_METADATA_DIRECTORY_NAME,
    );
}

function getManagedWorkspacesRegistryPath(sandboxRoot: string): string {
    return path.join(
        getSandboxStateRootPath(sandboxRoot),
        MANAGED_WORKSPACES_REGISTRY_NAME,
    );
}

export function getWorkspaceActiveKey(params: {
    sandboxRoot: string;
    agentId: string;
    userId: string;
    conversationId: string;
}): string {
    return getWorkspaceActiveKeyFromSegments({
        sandboxRoot: params.sandboxRoot,
        agentIdSegment: params.agentId,
        userIdSegment: getSandboxUserPathSegment(params.userId),
        conversationIdSegment: getSandboxConversationPathSegment(
            params.conversationId,
        ),
    });
}

export function getWorkspaceActiveKeyFromSegments(params: {
    sandboxRoot: string;
    agentIdSegment: string;
    userIdSegment: string;
    conversationIdSegment: string;
}): string {
    return JSON.stringify([
        canonicalizePathForComparison(params.sandboxRoot),
        params.agentIdSegment,
        params.userIdSegment,
        params.conversationIdSegment,
    ]);
}

export class WorkspaceManager {
    private readonly getConfig: () => AgentchatConfig;
    private readonly getRootsRegistryPath: () => string;
    private readonly pendingWorkspaceCreations = new Map<
        string,
        Promise<{ path: string; wasReset: boolean; cleanupOnFailure: boolean }>
    >();
    private readonly recentWorkspaceTouches = new Map<string, number>();
    private readonly managedWorkspaceRegistryMutations = new Map<
        string,
        Promise<void>
    >();
    private readonly knownSandboxRoots = new Set<string>();
    private lastPublishedInstanceKey: string | null = null;
    private lastSandboxRootsRegistryHeartbeatAt = 0;

    constructor(params: {
        getConfig: () => AgentchatConfig;
        stateId?: string;
        rootsRegistryPath?: string;
        getRootsRegistryPath?: () => string;
    }) {
        this.getConfig = params.getConfig;
        this.getRootsRegistryPath =
            params.getRootsRegistryPath ??
            (() =>
                path.resolve(
                    params.rootsRegistryPath ??
                        getSandboxRootsRegistryPath(
                            params.stateId ??
                                this.getConfig().stateId ??
                                resolveDefaultStateId("agentchat.config.json"),
                        ),
                ));
        this.syncSandboxRootsRegistry({ forceHeartbeat: true });
    }

    async ensureWorkspaceState(
        agent: AgentConfig,
        userId: string,
        conversationId: string,
    ): Promise<{ path: string; wasReset: boolean; cleanupOnFailure: boolean }> {
        this.syncSandboxRootsRegistry();
        this.pruneRecentWorkspaceTouches();
        if (agent.workspaceMode === "shared") {
            return {
                path: agent.rootPath,
                wasReset: false,
                cleanupOnFailure: false,
            };
        }

        const creationKey = getWorkspaceActiveKey({
            sandboxRoot: this.getConfig().sandboxRoot,
            agentId: agent.id,
            userId,
            conversationId,
        });
        const pendingCreation = this.pendingWorkspaceCreations.get(creationKey);
        if (pendingCreation) {
            const workspaceState = await pendingCreation;
            this.noteWorkspaceTouch(creationKey);
            return workspaceState;
        }

        const sandboxPath = this.sandboxPath(agent.id, userId, conversationId);
        if (existsSync(sandboxPath)) {
            const metadata = await this.readWorkspaceMetadata(sandboxPath);
            if (
                metadata &&
                metadata.state === "ready" &&
                metadata.sourceRootPath ===
                    canonicalizePathForComparison(agent.rootPath) &&
                (await this.isReusableWorkspaceTarget(
                    this.getConfig().sandboxRoot,
                    sandboxPath,
                    [
                        agent.id,
                        getSandboxUserPathSegment(userId),
                        getSandboxConversationPathSegment(conversationId),
                    ],
                ))
            ) {
                const workspaceState = {
                    path: sandboxPath,
                    wasReset: false,
                    cleanupOnFailure: false,
                };
                this.noteWorkspaceTouch(creationKey);
                return workspaceState;
            }

            const canRecoverMissingMetadata =
                !metadata &&
                (await this.hasManagedWorkspaceRecord(sandboxPath)) &&
                (await this.isReusableWorkspaceTarget(
                    this.getConfig().sandboxRoot,
                    sandboxPath,
                    [
                        agent.id,
                        getSandboxUserPathSegment(userId),
                        getSandboxConversationPathSegment(conversationId),
                    ],
                ));
            if (!metadata && !canRecoverMissingMetadata) {
                throw new Error(
                    `Refusing to reuse unmanaged sandbox path without metadata: ${sandboxPath}`,
                );
            }

            const recreation = (async () => {
                await this.deleteWorkspacePathBySegments({
                    sandboxRoot: this.getConfig().sandboxRoot,
                    targetPath: sandboxPath,
                    expectedTailSegments: [
                        agent.id,
                        getSandboxUserPathSegment(userId),
                        getSandboxConversationPathSegment(conversationId),
                    ],
                    allowMissingMetadata: canRecoverMissingMetadata,
                });
                if (existsSync(sandboxPath)) {
                    throw new Error(
                        `Failed to reset sandbox workspace before recreating it: ${sandboxPath}`,
                    );
                }

                return {
                    path: await this.createWorkspace(
                        agent.rootPath,
                        sandboxPath,
                    ),
                    wasReset: true,
                    cleanupOnFailure: true,
                };
            })();
            this.pendingWorkspaceCreations.set(creationKey, recreation);
            try {
                const workspaceState = await recreation;
                this.noteWorkspaceTouch(creationKey);
                return workspaceState;
            } finally {
                this.pendingWorkspaceCreations.delete(creationKey);
            }
        }

        const creation = (async () => {
            const metadata = await this.readWorkspaceMetadata(sandboxPath);
            return {
                path: await this.createWorkspace(agent.rootPath, sandboxPath),
                wasReset: metadata !== null,
                cleanupOnFailure: true,
            };
        })();
        this.pendingWorkspaceCreations.set(creationKey, creation);
        try {
            const workspaceState = await creation;
            this.noteWorkspaceTouch(creationKey);
            return workspaceState;
        } finally {
            this.pendingWorkspaceCreations.delete(creationKey);
        }
    }

    /**
     * Returns the working directory for a conversation.
     * - shared mode: returns the agent's rootPath directly
     * - copy-on-conversation mode: returns a sandbox path, creating the copy if needed
     */
    async ensureWorkspace(
        agent: AgentConfig,
        userId: string,
        conversationId: string,
    ): Promise<string> {
        return (await this.ensureWorkspaceState(agent, userId, conversationId))
            .path;
    }

    getWorkspacePath(
        agentId: string,
        userId: string,
        conversationId: string,
    ): string {
        return this.sandboxPathForRoot(
            this.getConfig().sandboxRoot,
            agentId,
            userId,
            conversationId,
        );
    }

    /**
     * Deletes the sandbox directory for a conversation.
     * Only operates on paths strictly under sandboxRoot. Never touches rootPath.
     */
    async deleteWorkspace(
        agentId: string,
        userId: string,
        conversationId: string,
    ): Promise<void> {
        this.syncSandboxRootsRegistry();
        for (const sandboxRoot of this.getKnownSandboxRoots()) {
            const target = this.sandboxPathForRoot(
                sandboxRoot,
                agentId,
                userId,
                conversationId,
            );

            await this.deleteWorkspacePath({
                sandboxRoot,
                targetPath: target,
                agentId,
                userId,
                conversationId,
            });
        }
    }

    async deleteWorkspacePath(params: {
        sandboxRoot: string;
        targetPath: string;
        agentId: string;
        userId: string;
        conversationId: string;
    }): Promise<void> {
        await this.deleteWorkspacePathBySegments({
            sandboxRoot: params.sandboxRoot,
            targetPath: params.targetPath,
            expectedTailSegments: [
                params.agentId,
                getSandboxUserPathSegment(params.userId),
                getSandboxConversationPathSegment(params.conversationId),
            ],
        });
    }

    private async deleteWorkspacePathBySegments(params: {
        sandboxRoot: string;
        targetPath: string;
        expectedTailSegments: [string, string, string];
        allowMissingMetadata?: boolean;
    }): Promise<void> {
        const target = path.resolve(params.targetPath);
        if (
            !this.hasExpectedWorkspaceTail(target, params.expectedTailSegments)
        ) {
            console.error(
                `[agentchat-server] refused to delete workspace with unexpected path tail: ${target}`,
            );
            return;
        }

        const config = this.getConfig();
        // Never delete any agent rootPath
        for (const agent of config.agents) {
            if (pathsOverlap(target, agent.rootPath)) {
                console.error(
                    `[agentchat-server] refused to delete workspace that overlaps agent rootPath: ${target}`,
                );
                return;
            }
        }

        if (!existsSync(target)) {
            await this.deleteWorkspaceMetadata(target);
            await this.removeManagedWorkspaceRecord(target);
            return;
        }

        if (
            !params.allowMissingMetadata &&
            !(await this.hasManagedWorkspaceMetadata(target))
        ) {
            console.error(
                `[agentchat-server] refused to delete workspace without sandbox metadata: ${target}`,
            );
            return;
        }

        if (!(await this.isSafeSandboxTarget(params.sandboxRoot, target))) {
            console.error(
                `[agentchat-server] refused to delete workspace outside sandboxRoot: ${target}`,
            );
            return;
        }

        await rm(target, { recursive: true, force: true });
        await this.deleteWorkspaceMetadata(target);
        await this.removeManagedWorkspaceRecord(target);
        console.log(`[agentchat-server] deleted sandbox workspace: ${target}`);
    }

    /**
     * Removes sandbox directories whose userId:conversationId key is not in the
     * active set. Call on startup and periodically as a safety net.
     */
    async reconcile(activeKeys: Set<string>): Promise<void> {
        this.syncSandboxRootsRegistry();
        const reconcileStartedAt = Date.now();
        this.pruneRecentWorkspaceTouches(reconcileStartedAt);

        for (const sandboxRoot of this.getKnownSandboxRoots()) {
            if (!existsSync(sandboxRoot)) {
                continue;
            }

            let agentDirs: string[];
            try {
                agentDirs = readdirSync(sandboxRoot);
            } catch {
                continue;
            }

            for (const agentDir of agentDirs) {
                if (agentDir === SANDBOX_STATE_DIRECTORY_NAME) {
                    continue;
                }

                const agentPath = path.join(sandboxRoot, agentDir);
                let userDirs: string[];
                try {
                    userDirs = readdirSync(agentPath);
                } catch {
                    continue;
                }

                for (const userDir of userDirs) {
                    const userPath = path.join(agentPath, userDir);
                    let convDirs: string[];
                    try {
                        convDirs = readdirSync(userPath);
                    } catch {
                        continue;
                    }

                    for (const convDir of convDirs) {
                        const key = getWorkspaceActiveKeyFromSegments({
                            sandboxRoot,
                            agentIdSegment: agentDir,
                            userIdSegment: userDir,
                            conversationIdSegment: convDir,
                        });
                        if (
                            activeKeys.has(key) ||
                            this.pendingWorkspaceCreations.has(key) ||
                            this.wasWorkspaceTouchedAfter(
                                key,
                                reconcileStartedAt,
                            )
                        ) {
                            continue;
                        }

                        const target = path.join(userPath, convDir);
                        await this.deleteWorkspacePathBySegments({
                            sandboxRoot,
                            targetPath: target,
                            expectedTailSegments: [agentDir, userDir, convDir],
                        });
                        if (!existsSync(target)) {
                            console.log(
                                `[agentchat-server] reconcile: removed orphaned sandbox: ${target}`,
                            );
                        }
                    }
                }
            }
        }
    }

    private noteWorkspaceTouch(key: string): void {
        const now = Date.now();
        this.recentWorkspaceTouches.set(key, now);
        this.pruneRecentWorkspaceTouches(now);
    }

    private wasWorkspaceTouchedAfter(key: string, timestamp: number): boolean {
        return (this.recentWorkspaceTouches.get(key) ?? 0) > timestamp;
    }

    private pruneRecentWorkspaceTouches(now = Date.now()): void {
        for (const [key, touchedAt] of this.recentWorkspaceTouches) {
            if (touchedAt < now - RECENT_WORKSPACE_TOUCH_TTL_MS) {
                this.recentWorkspaceTouches.delete(key);
            }
        }
    }

    hasManagedWorkspaces(): boolean {
        this.syncSandboxRootsRegistry();
        for (const sandboxRoot of this.getKnownSandboxRoots()) {
            const workspaceMetadataRootPath =
                getWorkspaceMetadataRootPath(sandboxRoot);
            const managedWorkspacesRegistryPath =
                getManagedWorkspacesRegistryPath(sandboxRoot);
            if (!existsSync(workspaceMetadataRootPath)) {
                if (!existsSync(managedWorkspacesRegistryPath)) {
                    continue;
                }
            }

            try {
                if (
                    readdirSync(workspaceMetadataRootPath).some((entry) =>
                        entry.endsWith(".json"),
                    )
                ) {
                    return true;
                }
            } catch {
                // continue checking other sandbox roots
            }

            try {
                const registry = JSON.parse(
                    readFileSync(managedWorkspacesRegistryPath, "utf8"),
                ) as unknown;
                if (Array.isArray(registry) && registry.length > 0) {
                    return true;
                }
            } catch {
                // continue checking other sandbox roots
            }
        }

        return false;
    }

    listKnownSandboxRoots(): string[] {
        return this.getKnownSandboxRoots();
    }

    listCurrentSandboxRoots(): string[] {
        return Object.values(this.syncSandboxRootsRegistry().activeInstances)
            .map((entry) => entry.rootPath)
            .filter(
                (rootPath, index, roots) => roots.indexOf(rootPath) === index,
            )
            .sort((left, right) => left.localeCompare(right));
    }

    private sandboxPath(
        agentId: string,
        userId: string,
        conversationId: string,
    ): string {
        return this.sandboxPathForRoot(
            this.getConfig().sandboxRoot,
            agentId,
            userId,
            conversationId,
        );
    }

    private async createWorkspace(
        sourcePath: string,
        sandboxPath: string,
    ): Promise<string> {
        const resolvedSourcePath = canonicalizePathForComparison(sourcePath);
        await this.assertWorkspaceSourceHasNoSymlinks(
            resolvedSourcePath,
            resolvedSourcePath,
        );
        await this.writeWorkspaceMetadata(sandboxPath, {
            sourceRootPath: resolvedSourcePath,
            state: "creating",
        });
        await mkdir(sandboxPath, { recursive: true });
        try {
            await cp(resolvedSourcePath, sandboxPath, { recursive: true });
            await this.writeWorkspaceMetadata(sandboxPath, {
                sourceRootPath: resolvedSourcePath,
                state: "ready",
            });
            await this.recordManagedWorkspace(sandboxPath);
        } catch (error) {
            // Clean up the partially created directory so the next
            // attempt starts fresh rather than reusing a broken copy.
            try {
                await rm(sandboxPath, { recursive: true, force: true });
            } catch {
                // best-effort cleanup
            }
            await this.deleteWorkspaceMetadata(sandboxPath);
            await this.removeManagedWorkspaceRecord(sandboxPath);
            throw error;
        }
        console.log(
            `[agentchat-server] created sandbox workspace: ${sandboxPath}`,
        );
        return sandboxPath;
    }

    private async assertWorkspaceSourceHasNoSymlinks(
        sourceRootPath: string,
        currentPath: string,
    ): Promise<void> {
        const entries = await readdir(currentPath, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const entryPath = path.join(currentPath, entry.name);
            if (entry.isSymbolicLink()) {
                throw new Error(
                    `Sandbox workspace source contains symlink: ${path.relative(sourceRootPath, entryPath)}`,
                );
            }

            if (entry.isDirectory()) {
                await this.assertWorkspaceSourceHasNoSymlinks(
                    sourceRootPath,
                    entryPath,
                );
            }
        }
    }

    private async readWorkspaceMetadata(
        sandboxPath: string,
    ): Promise<WorkspaceMetadata | null> {
        try {
            const raw = await readFile(
                this.getWorkspaceMetadataPath(sandboxPath),
                "utf8",
            );
            const parsed = JSON.parse(raw) as {
                sourceRootPath?: unknown;
                state?: unknown;
            };
            if (
                typeof parsed.sourceRootPath !== "string" ||
                (parsed.state !== undefined &&
                    parsed.state !== "creating" &&
                    parsed.state !== "ready")
            ) {
                return null;
            }
            return {
                sourceRootPath: canonicalizePathForComparison(
                    parsed.sourceRootPath,
                ),
                state: parsed.state === "creating" ? "creating" : "ready",
            };
        } catch {
            return null;
        }
    }

    private async writeWorkspaceMetadata(
        sandboxPath: string,
        metadata: WorkspaceMetadata,
    ): Promise<void> {
        const metadataPath = this.getWorkspaceMetadataPath(sandboxPath);
        await mkdir(path.dirname(metadataPath), { recursive: true });
        await writeFile(
            metadataPath,
            `${JSON.stringify(metadata, null, 2)}\n`,
            "utf8",
        );
    }

    private async deleteWorkspaceMetadata(sandboxPath: string): Promise<void> {
        await rm(this.getWorkspaceMetadataPath(sandboxPath), {
            force: true,
        });
    }

    private async hasManagedWorkspaceMetadata(
        sandboxPath: string,
    ): Promise<boolean> {
        return (
            (await this.readWorkspaceMetadata(sandboxPath)) !== null ||
            (await this.hasManagedWorkspaceRecord(sandboxPath))
        );
    }

    private async hasManagedWorkspaceRecord(
        sandboxPath: string,
    ): Promise<boolean> {
        const registry = await this.readManagedWorkspaceRegistry(
            this.getWorkspacePathInfo(sandboxPath),
        );
        return registry.has(this.getManagedWorkspaceRegistryKey(sandboxPath));
    }

    private async recordManagedWorkspace(sandboxPath: string): Promise<void> {
        const workspacePathInfo = this.getWorkspacePathInfo(sandboxPath);
        await this.updateManagedWorkspaceRegistry(
            workspacePathInfo,
            (registry) => {
                registry.add(
                    path.join(
                        workspacePathInfo.sandboxRoot,
                        workspacePathInfo.relativeWorkspacePath,
                    ),
                );
            },
        );
    }

    private async removeManagedWorkspaceRecord(
        sandboxPath: string,
    ): Promise<void> {
        const workspacePathInfo = this.getWorkspacePathInfo(sandboxPath);
        await this.updateManagedWorkspaceRegistry(
            workspacePathInfo,
            (registry) => {
                registry.delete(
                    this.getManagedWorkspaceRegistryKey(sandboxPath),
                );
            },
        );
    }

    private getWorkspaceMetadataPath(sandboxPath: string): string {
        const { sandboxRoot, relativeWorkspacePath } =
            this.getWorkspacePathInfo(sandboxPath);
        return path.join(
            getWorkspaceMetadataRootPath(sandboxRoot),
            `${getStableStateKey(
                path.join(
                    canonicalizePathForComparison(sandboxRoot),
                    relativeWorkspacePath,
                ),
            )}.json`,
        );
    }

    private getWorkspacePathInfo(sandboxPath: string): {
        sandboxRoot: string;
        relativeWorkspacePath: string;
    } {
        const sandboxRoot = path.dirname(
            path.dirname(path.dirname(sandboxPath)),
        );
        return {
            sandboxRoot: path.resolve(sandboxRoot),
            relativeWorkspacePath: path.relative(
                path.resolve(sandboxRoot),
                path.resolve(sandboxPath),
            ),
        };
    }

    private getManagedWorkspaceRegistryKey(sandboxPath: string): string {
        const { sandboxRoot, relativeWorkspacePath } =
            this.getWorkspacePathInfo(sandboxPath);
        return path.join(sandboxRoot, relativeWorkspacePath);
    }

    private async readManagedWorkspaceRegistry(workspacePathInfo: {
        sandboxRoot: string;
    }): Promise<Set<string>> {
        const registryPath = getManagedWorkspacesRegistryPath(
            workspacePathInfo.sandboxRoot,
        );
        try {
            const raw = await readFile(registryPath, "utf8");
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                return new Set();
            }

            return new Set(
                parsed.filter(
                    (value): value is string =>
                        typeof value === "string" && value.length > 0,
                ),
            );
        } catch {
            return new Set();
        }
    }

    private async writeManagedWorkspaceRegistry(
        workspacePathInfo: {
            sandboxRoot: string;
        },
        registry: Set<string>,
    ): Promise<void> {
        const registryPath = getManagedWorkspacesRegistryPath(
            workspacePathInfo.sandboxRoot,
        );
        await mkdir(path.dirname(registryPath), { recursive: true });
        if (registry.size === 0) {
            await rm(registryPath, { force: true });
            return;
        }

        await writeFile(
            registryPath,
            `${JSON.stringify(
                [...registry].sort((left, right) => left.localeCompare(right)),
                null,
                2,
            )}\n`,
            "utf8",
        );
    }

    private async updateManagedWorkspaceRegistry(
        workspacePathInfo: {
            sandboxRoot: string;
            relativeWorkspacePath: string;
        },
        mutate: (registry: Set<string>) => void,
    ): Promise<void> {
        const registryPath = getManagedWorkspacesRegistryPath(
            workspacePathInfo.sandboxRoot,
        );
        const previous =
            this.managedWorkspaceRegistryMutations.get(registryPath) ??
            Promise.resolve();
        let releaseCurrentMutation!: () => void;
        const currentMutation = new Promise<void>((resolve) => {
            releaseCurrentMutation = resolve;
        });
        const mutationChain = previous
            .catch(() => undefined)
            .then(() => currentMutation);
        this.managedWorkspaceRegistryMutations.set(registryPath, mutationChain);

        try {
            await previous.catch(() => undefined);
            const registry =
                await this.readManagedWorkspaceRegistry(workspacePathInfo);
            mutate(registry);
            await this.writeManagedWorkspaceRegistry(
                workspacePathInfo,
                registry,
            );
        } finally {
            releaseCurrentMutation();
            if (
                this.managedWorkspaceRegistryMutations.get(registryPath) ===
                mutationChain
            ) {
                this.managedWorkspaceRegistryMutations.delete(registryPath);
            }
        }
    }

    private sandboxPathForRoot(
        sandboxRoot: string,
        agentId: string,
        userId: string,
        conversationId: string,
    ): string {
        this.syncSandboxRootsRegistry();
        return getSandboxWorkspacePath({
            sandboxRoot,
            agentId,
            userId,
            conversationId,
        });
    }

    private getKnownSandboxRoots(): string[] {
        const registry = this.syncSandboxRootsRegistry();
        return registry.roots;
    }

    private syncSandboxRootsRegistry(params?: {
        forceHeartbeat?: boolean;
    }): SandboxRootsRegistry {
        const now = Date.now();
        const registry = this.readSandboxRootsRegistry();
        let didMutateRegistry = false;
        for (const [instanceKey, entry] of Object.entries(
            registry.activeInstances,
        )) {
            if (entry.updatedAt < now - SANDBOX_ROOT_REGISTRY_INSTANCE_TTL_MS) {
                delete registry.activeInstances[instanceKey];
                didMutateRegistry = true;
            }
        }

        const sandboxRoot = canonicalizePathForComparison(
            this.getConfig().sandboxRoot,
        );
        if (!registry.roots.includes(sandboxRoot)) {
            registry.roots.push(sandboxRoot);
            didMutateRegistry = true;
        }

        const instanceKey = this.getConfig().instanceKey;
        if (
            this.lastPublishedInstanceKey &&
            this.lastPublishedInstanceKey !== instanceKey &&
            registry.activeInstances[this.lastPublishedInstanceKey]
        ) {
            delete registry.activeInstances[this.lastPublishedInstanceKey];
            didMutateRegistry = true;
        }

        const previousEntry = registry.activeInstances[instanceKey];
        const shouldHeartbeat =
            params?.forceHeartbeat === true ||
            now - this.lastSandboxRootsRegistryHeartbeatAt >=
                SANDBOX_ROOT_REGISTRY_HEARTBEAT_MS;
        if (
            !previousEntry ||
            previousEntry.rootPath !== sandboxRoot ||
            shouldHeartbeat
        ) {
            registry.activeInstances[instanceKey] = {
                rootPath: sandboxRoot,
                updatedAt: now,
            };
            didMutateRegistry = true;
            this.lastSandboxRootsRegistryHeartbeatAt = now;
        }

        const normalizedRoots = [...new Set(registry.roots)]
            .map((rootPath) => canonicalizePathForComparison(rootPath))
            .sort((left, right) => left.localeCompare(right));
        registry.roots = normalizedRoots;
        this.knownSandboxRoots.clear();
        for (const rootPath of normalizedRoots) {
            this.knownSandboxRoots.add(rootPath);
        }

        if (didMutateRegistry) {
            this.writeSandboxRootsRegistry(registry);
        }
        this.lastPublishedInstanceKey = instanceKey;
        return registry;
    }

    private readSandboxRootsRegistry(): SandboxRootsRegistry {
        const rootsRegistryPath = this.getRootsRegistryPath();
        if (!existsSync(rootsRegistryPath)) {
            return {
                roots: [],
                activeInstances: {},
            };
        }

        try {
            const raw = readFileSync(rootsRegistryPath, "utf8");
            const parsed = JSON.parse(raw) as unknown;
            if (Array.isArray(parsed)) {
                return {
                    roots: parsed.filter(
                        (value): value is string =>
                            typeof value === "string" && value.length > 0,
                    ),
                    activeInstances: {},
                };
            }
            if (!parsed || typeof parsed !== "object") {
                return {
                    roots: [],
                    activeInstances: {},
                };
            }

            const rawRoots = Array.isArray(
                (parsed as { roots?: unknown }).roots,
            )
                ? ((parsed as { roots: unknown[] }).roots ?? [])
                : [];
            const activeInstances = (parsed as { activeInstances?: unknown })
                .activeInstances;
            const normalizedActiveInstances: SandboxRootsRegistry["activeInstances"] =
                {};
            if (activeInstances && typeof activeInstances === "object") {
                for (const [instanceKey, value] of Object.entries(
                    activeInstances as Record<string, unknown>,
                )) {
                    if (
                        !value ||
                        typeof value !== "object" ||
                        typeof (value as { rootPath?: unknown }).rootPath !==
                            "string" ||
                        typeof (value as { updatedAt?: unknown }).updatedAt !==
                            "number"
                    ) {
                        continue;
                    }

                    normalizedActiveInstances[instanceKey] = {
                        rootPath: canonicalizePathForComparison(
                            (value as { rootPath: string }).rootPath,
                        ),
                        updatedAt: Math.max(
                            0,
                            (value as { updatedAt: number }).updatedAt,
                        ),
                    };
                }
            }

            return {
                roots: rawRoots.filter(
                    (value): value is string =>
                        typeof value === "string" && value.length > 0,
                ),
                activeInstances: normalizedActiveInstances,
            };
        } catch (error) {
            console.error(
                `[agentchat-server] failed to load sandbox root registry from ${rootsRegistryPath}:`,
                error,
            );
            return {
                roots: [],
                activeInstances: {},
            };
        }
    }

    private writeSandboxRootsRegistry(registry: SandboxRootsRegistry): void {
        const rootsRegistryPath = this.getRootsRegistryPath();
        try {
            mkdirSync(path.dirname(rootsRegistryPath), {
                recursive: true,
            });
            writeFileSync(
                rootsRegistryPath,
                `${JSON.stringify(registry, null, 2)}\n`,
                "utf8",
            );
        } catch (error) {
            console.error(
                `[agentchat-server] failed to persist sandbox root registry to ${rootsRegistryPath}:`,
                error,
            );
        }
    }

    private hasExpectedWorkspaceTail(
        targetPath: string,
        expectedTailSegments: [string, string, string],
    ): boolean {
        const segments = path
            .resolve(targetPath)
            .split(path.sep)
            .filter(Boolean);
        if (segments.length < 3) {
            return false;
        }

        const tail = segments.slice(-3);
        return tail.every(
            (segment, index) => segment === expectedTailSegments[index],
        );
    }

    private async isReusableWorkspaceTarget(
        sandboxRoot: string,
        target: string,
        expectedTailSegments: [string, string, string],
    ): Promise<boolean> {
        if (!existsSync(target)) {
            return false;
        }

        if (!this.hasExpectedWorkspaceTail(target, expectedTailSegments)) {
            return false;
        }

        if (!(await this.isSafeSandboxTarget(sandboxRoot, target))) {
            return false;
        }

        try {
            const entry = lstatSync(target);
            return entry.isDirectory() && !entry.isSymbolicLink();
        } catch {
            return false;
        }
    }

    /**
     * Validates a target path is exactly 3 levels deep under sandboxRoot.
     * Structure: <sandboxRoot>/<agentId>/<userId>/<conversationId>
     */
    private async isSafeSandboxTarget(
        sandboxRoot: string,
        target: string,
    ): Promise<boolean> {
        if (!existsSync(target)) {
            return false;
        }

        const resolved = path.resolve(target);
        const resolvedRoot = path.resolve(sandboxRoot);

        if (!resolved.startsWith(resolvedRoot + path.sep)) {
            return false;
        }

        // Must be exactly <sandboxRoot>/<agentId>/<userId>/<conversationId>
        const relative = path.relative(resolvedRoot, resolved);
        const segments = relative.split(path.sep).filter(Boolean);
        if (segments.length !== 3) {
            return false;
        }

        try {
            const realRoot = realpathSync(sandboxRoot);
            const realParent = realpathSync(path.dirname(target));
            return (
                realParent === realRoot ||
                realParent.startsWith(realRoot + path.sep)
            );
        } catch {
            return false;
        }
    }
}
