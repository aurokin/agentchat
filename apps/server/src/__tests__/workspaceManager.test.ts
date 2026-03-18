import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { WorkspaceManager } from "../workspaceManager.ts";
import type { AgentchatConfig, AgentConfig } from "../config.ts";

const tempRoots: string[] = [];

function makeTempDir(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `${name}-`));
    tempRoots.push(dir);
    return dir;
}

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
    return {
        id: "test-agent",
        name: "Test Agent",
        enabled: true,
        defaultVisible: true,
        visibilityOverrides: [],
        rootPath: "/tmp/placeholder",
        providerIds: ["codex-main"],
        defaultProviderId: "codex-main",
        modelAllowlist: [],
        variantAllowlist: [],
        tags: [],
        sortOrder: 0,
        workspaceMode: "shared",
        ...overrides,
    };
}

function makeConfig(overrides: {
    sandboxRoot: string;
    agents?: AgentConfig[];
}): AgentchatConfig {
    return {
        version: 1,
        sandboxRoot: overrides.sandboxRoot,
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
        providers: [],
        agents: overrides.agents ?? [makeAgent()],
    };
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("WorkspaceManager", () => {
    describe("ensureWorkspace", () => {
        test("returns rootPath directly for shared mode agents", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const agent = makeAgent({
                rootPath: "/some/path",
                workspaceMode: "shared",
            });
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
            });

            const result = manager.ensureWorkspace(agent, "conv-1");
            expect(result).toBe("/some/path");
        });

        test("copies rootPath to sandbox for copy-on-conversation mode", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "README.md"), "hello");
            mkdirSync(path.join(rootPath, "src"));
            writeFileSync(path.join(rootPath, "src", "index.ts"), "export {}");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
            });

            const result = manager.ensureWorkspace(agent, "conv-123");

            expect(result).toBe(
                path.join(sandboxRoot, "my-agent", "conv-123"),
            );
            expect(existsSync(result)).toBe(true);
            expect(
                readFileSync(path.join(result, "README.md"), "utf8"),
            ).toBe("hello");
            expect(
                readFileSync(path.join(result, "src", "index.ts"), "utf8"),
            ).toBe("export {}");
        });

        test("is idempotent — does not overwrite existing sandbox", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "original");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
            });

            const first = manager.ensureWorkspace(agent, "conv-1");
            // Modify the sandbox copy
            writeFileSync(path.join(first, "file.txt"), "modified");

            // Change the source
            writeFileSync(path.join(rootPath, "file.txt"), "updated-source");

            const second = manager.ensureWorkspace(agent, "conv-1");
            expect(second).toBe(first);
            // Should keep the modified version, not re-copy
            expect(readFileSync(path.join(second, "file.txt"), "utf8")).toBe(
                "modified",
            );
        });
    });

    describe("deleteWorkspace", () => {
        test("removes a sandbox directory", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({ sandboxRoot, agents: [agent] });
            const manager = new WorkspaceManager({
                getConfig: () => config,
            });

            const workspace = manager.ensureWorkspace(agent, "conv-1");
            expect(existsSync(workspace)).toBe(true);

            manager.deleteWorkspace("my-agent", "conv-1");
            expect(existsSync(workspace)).toBe(false);
        });

        test("refuses to delete paths outside sandboxRoot", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const outsideDir = makeTempDir("outside");
            writeFileSync(path.join(outsideDir, "important.txt"), "keep");

            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
            });

            // Try to trick it with path traversal
            manager.deleteWorkspace("../../" + path.basename(outsideDir), "");
            expect(existsSync(outsideDir)).toBe(true);
        });

        test("refuses to delete agent rootPath", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "keep");

            // Construct a config where rootPath happens to be under sandboxRoot
            const agentId = "nested";
            const convId = "conv";
            const nestedRoot = path.join(sandboxRoot, agentId, convId);
            mkdirSync(nestedRoot, { recursive: true });
            writeFileSync(path.join(nestedRoot, "file.txt"), "keep");

            const agent = makeAgent({
                id: agentId,
                rootPath: nestedRoot,
                workspaceMode: "shared",
            });
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot, agents: [agent] }),
            });

            manager.deleteWorkspace(agentId, convId);
            // Should NOT have been deleted because it's the agent's rootPath
            expect(existsSync(nestedRoot)).toBe(true);
        });

        test("is a no-op for non-existent directories", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
            });

            // Should not throw
            manager.deleteWorkspace("agent-1", "conv-nonexistent");
        });
    });

    describe("reconcile", () => {
        test("removes sandbox directories not in the active set", () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "f.txt"), "x");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({ sandboxRoot, agents: [agent] });
            const manager = new WorkspaceManager({
                getConfig: () => config,
            });

            manager.ensureWorkspace(agent, "conv-keep");
            manager.ensureWorkspace(agent, "conv-remove");

            const keepPath = path.join(sandboxRoot, "agent-a", "conv-keep");
            const removePath = path.join(
                sandboxRoot,
                "agent-a",
                "conv-remove",
            );
            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(true);

            manager.reconcile(new Set(["conv-keep"]));

            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(false);
        });

        test("is a no-op when sandboxRoot does not exist", () => {
            const manager = new WorkspaceManager({
                getConfig: () =>
                    makeConfig({ sandboxRoot: "/nonexistent/path" }),
            });

            // Should not throw
            manager.reconcile(new Set());
        });
    });
});
