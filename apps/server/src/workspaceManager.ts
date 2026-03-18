import { cpSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";

import type { AgentchatConfig, AgentConfig } from "./config.ts";

const UNSAFE_SEGMENT_PATTERN = /[/\\\0]|^\.\.$/;

function assertSafePathSegment(label: string, value: string): void {
    if (!value || UNSAFE_SEGMENT_PATTERN.test(value)) {
        throw new Error(
            `Unsafe ${label} for sandbox path: ${JSON.stringify(value)}`,
        );
    }
}

export class WorkspaceManager {
    private readonly getConfig: () => AgentchatConfig;

    constructor(params: { getConfig: () => AgentchatConfig }) {
        this.getConfig = params.getConfig;
    }

    /**
     * Returns the working directory for a conversation.
     * - shared mode: returns the agent's rootPath directly
     * - copy-on-conversation mode: returns a sandbox path, creating the copy if needed
     */
    ensureWorkspace(
        agent: AgentConfig,
        userId: string,
        conversationId: string,
    ): string {
        if (agent.workspaceMode === "shared") {
            return agent.rootPath;
        }

        const sandboxPath = this.sandboxPath(agent.id, userId, conversationId);
        if (!existsSync(sandboxPath)) {
            mkdirSync(sandboxPath, { recursive: true });
            try {
                cpSync(agent.rootPath, sandboxPath, { recursive: true });
            } catch (error) {
                // Clean up the partially created directory so the next
                // attempt starts fresh rather than reusing a broken copy.
                try {
                    rmSync(sandboxPath, { recursive: true, force: true });
                } catch {
                    // best-effort cleanup
                }
                throw error;
            }
            console.log(
                `[agentchat-server] created sandbox workspace: ${sandboxPath}`,
            );
        }
        return sandboxPath;
    }

    /**
     * Deletes the sandbox directory for a conversation.
     * Only operates on paths strictly under sandboxRoot. Never touches rootPath.
     */
    deleteWorkspace(
        agentId: string,
        userId: string,
        conversationId: string,
    ): void {
        const config = this.getConfig();
        const target = this.sandboxPath(agentId, userId, conversationId);

        if (!this.isSafeSandboxTarget(config.sandboxRoot, target)) {
            console.error(
                `[agentchat-server] refused to delete workspace outside sandboxRoot: ${target}`,
            );
            return;
        }

        // Never delete any agent rootPath
        for (const agent of config.agents) {
            if (target === agent.rootPath || agent.rootPath.startsWith(target + "/")) {
                console.error(
                    `[agentchat-server] refused to delete workspace that overlaps agent rootPath: ${target}`,
                );
                return;
            }
        }

        if (existsSync(target)) {
            rmSync(target, { recursive: true, force: true });
            console.log(
                `[agentchat-server] deleted sandbox workspace: ${target}`,
            );
        }
    }

    /**
     * Removes sandbox directories whose conversationId is not in the active set.
     * Call on startup and periodically as a safety net.
     */
    reconcile(activeConversationIds: Set<string>): void {
        const config = this.getConfig();
        const { sandboxRoot } = config;

        if (!existsSync(sandboxRoot)) {
            return;
        }

        let agentDirs: string[];
        try {
            agentDirs = readdirSync(sandboxRoot);
        } catch {
            return;
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
                    if (!activeConversationIds.has(convDir)) {
                        const target = path.join(userPath, convDir);
                        if (this.isSafeSandboxTarget(sandboxRoot, target)) {
                            rmSync(target, { recursive: true, force: true });
                            console.log(
                                `[agentchat-server] reconcile: removed orphaned sandbox: ${target}`,
                            );
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
        assertSafePathSegment("agentId", agentId);
        assertSafePathSegment("userId", userId);
        assertSafePathSegment("conversationId", conversationId);

        const { sandboxRoot } = this.getConfig();
        return path.join(sandboxRoot, agentId, userId, conversationId);
    }

    /**
     * Validates a target path is exactly 3 levels deep under sandboxRoot.
     * Structure: <sandboxRoot>/<agentId>/<userId>/<conversationId>
     */
    private isSafeSandboxTarget(
        sandboxRoot: string,
        target: string,
    ): boolean {
        const resolved = path.resolve(target);
        const resolvedRoot = path.resolve(sandboxRoot);

        if (!resolved.startsWith(resolvedRoot + "/")) {
            return false;
        }

        // Must be exactly <sandboxRoot>/<agentId>/<userId>/<conversationId>
        const relative = path.relative(resolvedRoot, resolved);
        const segments = relative.split(path.sep).filter(Boolean);
        return segments.length === 3;
    }
}
