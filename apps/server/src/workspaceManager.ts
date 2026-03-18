import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AgentchatConfig, AgentConfig } from "./config.ts";
import { getSandboxWorkspacePath } from "./sandboxPaths.ts";

export class WorkspaceManager {
    private readonly getConfig: () => AgentchatConfig;
    private readonly pendingWorkspaceCreations = new Map<
        string,
        Promise<string>
    >();
    private readonly knownSandboxRoots = new Set<string>();

    constructor(params: { getConfig: () => AgentchatConfig }) {
        this.getConfig = params.getConfig;
        this.rememberSandboxRoot(this.getConfig().sandboxRoot);
    }

    async ensureWorkspaceState(
        agent: AgentConfig,
        userId: string,
        conversationId: string,
    ): Promise<{ path: string; wasReset: boolean }> {
        if (agent.workspaceMode === "shared") {
            return { path: agent.rootPath, wasReset: false };
        }

        const creationKey = this.activeWorkspaceKey(
            agent.id,
            userId,
            conversationId,
        );
        const pendingCreation = this.pendingWorkspaceCreations.get(creationKey);
        if (pendingCreation) {
            return { path: await pendingCreation, wasReset: false };
        }

        const sandboxPath = this.sandboxPath(agent.id, userId, conversationId);
        if (existsSync(sandboxPath)) {
            const metadata = await this.readWorkspaceMetadata(sandboxPath);
            if (
                metadata &&
                metadata.sourceRootPath === path.resolve(agent.rootPath)
            ) {
                return { path: sandboxPath, wasReset: false };
            }

            const recreation = (async () => {
                await this.deleteWorkspacePath({
                    targetPath: sandboxPath,
                    agentId: agent.id,
                    userId,
                    conversationId,
                });

                return await this.createWorkspace(agent.rootPath, sandboxPath);
            })();
            this.pendingWorkspaceCreations.set(creationKey, recreation);
            try {
                return { path: await recreation, wasReset: true };
            } finally {
                this.pendingWorkspaceCreations.delete(creationKey);
            }
        }

        const creation = this.createWorkspace(agent.rootPath, sandboxPath);
        this.pendingWorkspaceCreations.set(creationKey, creation);
        try {
            return { path: await creation, wasReset: false };
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

            if (!this.isSafeSandboxTarget(sandboxRoot, target)) {
                console.error(
                    `[agentchat-server] refused to delete workspace outside sandboxRoot: ${target}`,
                );
                continue;
            }

            await this.deleteWorkspacePath({
                targetPath: target,
                agentId,
                userId,
                conversationId,
            });
        }
    }

    async deleteWorkspacePath(params: {
        targetPath: string;
        agentId: string;
        userId: string;
        conversationId: string;
    }): Promise<void> {
        const target = path.resolve(params.targetPath);
        if (
            !this.hasExpectedWorkspaceTail(
                target,
                params.agentId,
                params.userId,
                params.conversationId,
            )
        ) {
            console.error(
                `[agentchat-server] refused to delete workspace with unexpected path tail: ${target}`,
            );
            return;
        }

        const config = this.getConfig();
        // Never delete any agent rootPath
        for (const agent of config.agents) {
            const resolvedRootPath = path.resolve(agent.rootPath);
            if (
                target === resolvedRootPath ||
                resolvedRootPath.startsWith(target + path.sep)
            ) {
                console.error(
                    `[agentchat-server] refused to delete workspace that overlaps agent rootPath: ${target}`,
                );
                return;
            }
        }

        if (existsSync(target)) {
            await rm(target, { recursive: true, force: true });
            console.log(
                `[agentchat-server] deleted sandbox workspace: ${target}`,
            );
        }
    }

    /**
     * Removes sandbox directories whose userId:conversationId key is not in the
     * active set. Call on startup and periodically as a safety net.
     */
    async reconcile(activeKeys: Set<string>): Promise<void> {
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
                        const key = this.activeWorkspaceKey(
                            agentDir,
                            userDir,
                            convDir,
                        );
                        if (!activeKeys.has(key)) {
                            const target = path.join(userPath, convDir);
                            if (this.isSafeSandboxTarget(sandboxRoot, target)) {
                                await rm(target, {
                                    recursive: true,
                                    force: true,
                                });
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

    private activeWorkspaceKey(
        agentId: string,
        userId: string,
        conversationId: string,
    ): string {
        return `${agentId}:${userId}:${conversationId}`;
    }

    private async createWorkspace(
        sourcePath: string,
        sandboxPath: string,
    ): Promise<string> {
        await mkdir(sandboxPath, { recursive: true });
        try {
            await cp(sourcePath, sandboxPath, { recursive: true });
            await this.writeWorkspaceMetadata(sandboxPath, {
                sourceRootPath: path.resolve(sourcePath),
            });
        } catch (error) {
            // Clean up the partially created directory so the next
            // attempt starts fresh rather than reusing a broken copy.
            try {
                await rm(sandboxPath, { recursive: true, force: true });
            } catch {
                // best-effort cleanup
            }
            throw error;
        }
        console.log(
            `[agentchat-server] created sandbox workspace: ${sandboxPath}`,
        );
        return sandboxPath;
    }

    private async readWorkspaceMetadata(
        sandboxPath: string,
    ): Promise<{ sourceRootPath: string } | null> {
        try {
            const raw = await readFile(
                path.join(sandboxPath, ".agentchat-sandbox.json"),
                "utf8",
            );
            const parsed = JSON.parse(raw) as { sourceRootPath?: unknown };
            if (typeof parsed.sourceRootPath !== "string") {
                return null;
            }
            return {
                sourceRootPath: path.resolve(parsed.sourceRootPath),
            };
        } catch {
            return null;
        }
    }

    private async writeWorkspaceMetadata(
        sandboxPath: string,
        metadata: { sourceRootPath: string },
    ): Promise<void> {
        await writeFile(
            path.join(sandboxPath, ".agentchat-sandbox.json"),
            `${JSON.stringify(metadata, null, 2)}\n`,
            "utf8",
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
        this.knownSandboxRoots.add(path.resolve(sandboxRoot));
    }

    private getKnownSandboxRoots(): string[] {
        this.rememberSandboxRoot(this.getConfig().sandboxRoot);
        return [...this.knownSandboxRoots];
    }

    private hasExpectedWorkspaceTail(
        targetPath: string,
        agentId: string,
        userId: string,
        conversationId: string,
    ): boolean {
        const segments = path
            .resolve(targetPath)
            .split(path.sep)
            .filter(Boolean);
        if (segments.length < 3) {
            return false;
        }

        const tail = segments.slice(-3);
        return (
            tail[0] === agentId &&
            tail[1] === userId &&
            tail[2] === conversationId
        );
    }

    /**
     * Validates a target path is exactly 3 levels deep under sandboxRoot.
     * Structure: <sandboxRoot>/<agentId>/<userId>/<conversationId>
     */
    private isSafeSandboxTarget(sandboxRoot: string, target: string): boolean {
        const resolved = path.resolve(target);
        const resolvedRoot = path.resolve(sandboxRoot);

        if (!resolved.startsWith(resolvedRoot + path.sep)) {
            return false;
        }

        // Must be exactly <sandboxRoot>/<agentId>/<userId>/<conversationId>
        const relative = path.relative(resolvedRoot, resolved);
        const segments = relative.split(path.sep).filter(Boolean);
        return segments.length === 3;
    }
}
