import { createHash } from "node:crypto";
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
import os from "node:os";
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

const SANDBOX_STATE_DIRECTORY_NAME = ".agentchat-state";
const SANDBOX_ROOTS_REGISTRY_DIRECTORY_NAME = "sandbox-roots";
const WORKSPACE_METADATA_DIRECTORY_NAME = "workspace-metadata";

type WorkspaceMetadata = {
    sourceRootPath: string;
    state: "creating" | "ready";
};

function getStableStateKey(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sanitizeStateFileComponent(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getSandboxStateRootPath(sandboxRoot: string): string {
    return path.join(
        canonicalizePathForComparison(sandboxRoot),
        SANDBOX_STATE_DIRECTORY_NAME,
    );
}

function getDefaultAgentchatStateBasePath(): string {
    const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
    if (xdgStateHome) {
        return path.join(xdgStateHome, "agentchat");
    }

    return path.join(os.homedir(), ".local", "state", "agentchat");
}

export function getSandboxRootsRegistryPath(configPath: string): string {
    const resolvedConfigPath = path.resolve(configPath);
    const configBasename = sanitizeStateFileComponent(
        path.basename(resolvedConfigPath),
    );
    return path.join(
        getDefaultAgentchatStateBasePath(),
        SANDBOX_STATE_DIRECTORY_NAME,
        SANDBOX_ROOTS_REGISTRY_DIRECTORY_NAME,
        `${configBasename}-${getStableStateKey(
            canonicalizePathForComparison(resolvedConfigPath),
        )}.json`,
    );
}

export function getWorkspaceMetadataRootPath(sandboxRoot: string): string {
    return path.join(
        getSandboxStateRootPath(sandboxRoot),
        WORKSPACE_METADATA_DIRECTORY_NAME,
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
    private readonly knownSandboxRoots = new Set<string>();

    constructor(params: {
        getConfig: () => AgentchatConfig;
        rootsRegistryPath?: string;
        getRootsRegistryPath?: () => string;
    }) {
        this.getConfig = params.getConfig;
        this.getRootsRegistryPath =
            params.getRootsRegistryPath ??
            (() =>
                path.resolve(
                    params.rootsRegistryPath ??
                        getSandboxRootsRegistryPath("default"),
                ));
        this.loadKnownSandboxRoots();
        this.rememberSandboxRoot(this.getConfig().sandboxRoot);
    }

    async ensureWorkspaceState(
        agent: AgentConfig,
        userId: string,
        conversationId: string,
    ): Promise<{ path: string; wasReset: boolean; cleanupOnFailure: boolean }> {
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
            return await pendingCreation;
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
                return {
                    path: sandboxPath,
                    wasReset: false,
                    cleanupOnFailure: false,
                };
            }

            const canRecoverMissingMetadata =
                !metadata &&
                !this.hasManagedWorkspaces() &&
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
                return await recreation;
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
            return await creation;
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
        console.log(`[agentchat-server] deleted sandbox workspace: ${target}`);
    }

    /**
     * Removes sandbox directories whose userId:conversationId key is not in the
     * active set. Call on startup and periodically as a safety net.
     */
    async reconcile(activeKeys: Set<string>): Promise<void> {
        const protectedKeys = new Set(activeKeys);
        for (const key of this.pendingWorkspaceCreations.keys()) {
            protectedKeys.add(key);
        }

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
                        if (!protectedKeys.has(key)) {
                            const target = path.join(userPath, convDir);
                            await this.deleteWorkspacePathBySegments({
                                sandboxRoot,
                                targetPath: target,
                                expectedTailSegments: [
                                    agentDir,
                                    userDir,
                                    convDir,
                                ],
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
    }

    hasManagedWorkspaces(): boolean {
        for (const sandboxRoot of this.getKnownSandboxRoots()) {
            const workspaceMetadataRootPath =
                getWorkspaceMetadataRootPath(sandboxRoot);
            if (!existsSync(workspaceMetadataRootPath)) {
                continue;
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
        }

        return false;
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
            await cp(sourcePath, sandboxPath, { recursive: true });
            await this.writeWorkspaceMetadata(sandboxPath, {
                sourceRootPath: resolvedSourcePath,
                state: "ready",
            });
        } catch (error) {
            // Clean up the partially created directory so the next
            // attempt starts fresh rather than reusing a broken copy.
            try {
                await rm(sandboxPath, { recursive: true, force: true });
            } catch {
                // best-effort cleanup
            }
            await this.deleteWorkspaceMetadata(sandboxPath);
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
        return (await this.readWorkspaceMetadata(sandboxPath)) !== null;
    }

    private getWorkspaceMetadataPath(sandboxPath: string): string {
        const sandboxRoot = path.dirname(
            path.dirname(path.dirname(sandboxPath)),
        );
        const relativeWorkspacePath = path.relative(
            path.resolve(sandboxRoot),
            path.resolve(sandboxPath),
        );
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

    private sandboxPathForRoot(
        sandboxRoot: string,
        agentId: string,
        userId: string,
        conversationId: string,
    ): string {
        this.rememberSandboxRoot(sandboxRoot);
        return getSandboxWorkspacePath({
            sandboxRoot,
            agentId,
            userId,
            conversationId,
        });
    }

    private rememberSandboxRoot(sandboxRoot: string): void {
        const resolvedRoot = canonicalizePathForComparison(sandboxRoot);
        if (this.knownSandboxRoots.has(resolvedRoot)) {
            return;
        }

        this.knownSandboxRoots.add(resolvedRoot);
        this.persistKnownSandboxRoots();
    }

    private getKnownSandboxRoots(): string[] {
        this.rememberSandboxRoot(this.getConfig().sandboxRoot);
        return [...this.knownSandboxRoots];
    }

    private loadKnownSandboxRoots(): void {
        const rootsRegistryPath = this.getRootsRegistryPath();
        if (!existsSync(rootsRegistryPath)) {
            return;
        }

        try {
            const raw = readFileSync(rootsRegistryPath, "utf8");
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                return;
            }

            for (const value of parsed) {
                if (typeof value === "string" && value.length > 0) {
                    this.knownSandboxRoots.add(path.resolve(value));
                }
            }
        } catch (error) {
            console.error(
                `[agentchat-server] failed to load sandbox root registry from ${rootsRegistryPath}:`,
                error,
            );
        }
    }

    private persistKnownSandboxRoots(): void {
        const rootsRegistryPath = this.getRootsRegistryPath();
        try {
            mkdirSync(path.dirname(rootsRegistryPath), {
                recursive: true,
            });
            writeFileSync(
                rootsRegistryPath,
                `${JSON.stringify(
                    [...this.knownSandboxRoots].sort((left, right) =>
                        left.localeCompare(right),
                    ),
                    null,
                    2,
                )}\n`,
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
