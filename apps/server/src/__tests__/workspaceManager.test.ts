import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
    readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
    getSandboxRootsRegistryPath,
    WorkspaceManager,
} from "../workspaceManager.ts";
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

function createWorkspaceManager(
    getConfig: () => AgentchatConfig,
): WorkspaceManager {
    return new WorkspaceManager({
        getConfig,
        rootsRegistryPath: path.join(
            makeTempDir("sandbox-roots-registry"),
            "sandbox-roots.json",
        ),
    });
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("WorkspaceManager", () => {
    test("scopes the default sandbox root registry path by config path", () => {
        expect(
            getSandboxRootsRegistryPath("/tmp/agentchat/dev.config.json"),
        ).toBe("/tmp/agentchat/.dev.config.json.sandbox-roots.json");
        expect(
            getSandboxRootsRegistryPath("/tmp/agentchat/staging.config.json"),
        ).toBe("/tmp/agentchat/.staging.config.json.sandbox-roots.json");
    });

    describe("ensureWorkspace", () => {
        test("returns rootPath directly for shared mode agents", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const agent = makeAgent({
                rootPath: "/some/path",
                workspaceMode: "shared",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const result = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            expect(result).toBe("/some/path");
        });

        test("copies rootPath to sandbox for copy-on-conversation mode", async () => {
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
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const result = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-123",
            );

            expect(result).toBe(
                path.join(sandboxRoot, "my-agent", "user-1", "conv-123"),
            );
            expect(existsSync(result)).toBe(true);
            expect(readFileSync(path.join(result, "README.md"), "utf8")).toBe(
                "hello",
            );
            expect(
                readFileSync(path.join(result, "src", "index.ts"), "utf8"),
            ).toBe("export {}");
        });

        test("encodes filesystem-unsafe user ids in sandbox paths", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "README.md"), "hello");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const result = await manager.ensureWorkspace(
                agent,
                "users:abc123",
                "conv-123",
            );

            expect(result).toBe(
                path.join(
                    sandboxRoot,
                    "my-agent",
                    "~dXNlcnM6YWJjMTIz",
                    "conv-123",
                ),
            );
        });

        test("is idempotent — does not overwrite existing sandbox", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "original");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const first = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            // Modify the sandbox copy
            writeFileSync(path.join(first, "file.txt"), "modified");

            // Change the source
            writeFileSync(path.join(rootPath, "file.txt"), "updated-source");

            const second = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            expect(second).toBe(first);
            // Should keep the modified version, not re-copy
            expect(readFileSync(path.join(second, "file.txt"), "utf8")).toBe(
                "modified",
            );
        });

        test("refreshes an existing copied sandbox when the agent rootPath changes", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const firstRoot = makeTempDir("agent-root-a");
            const secondRoot = makeTempDir("agent-root-b");
            writeFileSync(path.join(firstRoot, "file.txt"), "first");
            writeFileSync(path.join(secondRoot, "file.txt"), "second");

            const agent = makeAgent({
                id: "my-agent",
                rootPath: firstRoot,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const first = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );
            expect(first.wasReset).toBe(false);
            expect(
                readFileSync(path.join(first.path, "file.txt"), "utf8"),
            ).toBe("first");

            const second = await manager.ensureWorkspaceState(
                { ...agent, rootPath: secondRoot },
                "user-1",
                "conv-1",
            );
            expect(second.wasReset).toBe(true);
            expect(second.path).toBe(first.path);
            expect(
                readFileSync(path.join(second.path, "file.txt"), "utf8"),
            ).toBe("second");
        });

        test("serializes concurrent initial sandbox creation per conversation", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            let createCalls = 0;
            let releaseCreation: () => void = () => undefined;
            const creationGate = new Promise<void>((resolve) => {
                releaseCreation = resolve;
            });
            const sandboxPath = path.join(
                sandboxRoot,
                "my-agent",
                "user-1",
                "conv-1",
            );

            (
                manager as unknown as {
                    createWorkspace: (
                        sourcePath: string,
                        targetPath: string,
                    ) => Promise<string>;
                }
            ).createWorkspace = async (_sourcePath, targetPath) => {
                createCalls += 1;
                mkdirSync(targetPath, { recursive: true });
                await creationGate;
                writeFileSync(path.join(targetPath, "file.txt"), "ready");
                return targetPath;
            };

            const first = manager.ensureWorkspace(agent, "user-1", "conv-1");
            const second = manager.ensureWorkspace(agent, "user-1", "conv-1");
            let secondResolved = false;
            void second.then(() => {
                secondResolved = true;
            });

            expect(createCalls).toBe(1);
            await Bun.sleep(0);
            expect(secondResolved).toBe(false);

            releaseCreation();

            await expect(first).resolves.toBe(sandboxPath);
            await expect(second).resolves.toBe(sandboxPath);
            expect(
                readFileSync(path.join(sandboxPath, "file.txt"), "utf8"),
            ).toBe("ready");
        });

        test("isolates sandboxes between different users", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "original");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const pathA = await manager.ensureWorkspace(
                agent,
                "user-a",
                "conv-1",
            );
            const pathB = await manager.ensureWorkspace(
                agent,
                "user-b",
                "conv-1",
            );

            expect(pathA).not.toBe(pathB);
            expect(pathA).toBe(
                path.join(sandboxRoot, "my-agent", "user-a", "conv-1"),
            );
            expect(pathB).toBe(
                path.join(sandboxRoot, "my-agent", "user-b", "conv-1"),
            );

            // Modifications in one user's sandbox don't affect the other
            writeFileSync(path.join(pathA, "file.txt"), "user-a-change");
            expect(readFileSync(path.join(pathB, "file.txt"), "utf8")).toBe(
                "original",
            );
        });

        test("rejects path-traversal in conversationId", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await expect(
                manager.ensureWorkspace(agent, "user-1", "../../../tmp/evil"),
            ).rejects.toThrow(/Unsafe conversationId/);
            await expect(
                manager.ensureWorkspace(agent, "user-1", ".."),
            ).rejects.toThrow(/Unsafe conversationId/);
            await expect(
                manager.ensureWorkspace(agent, "user-1", "."),
            ).rejects.toThrow(/Unsafe conversationId/);
            await expect(
                manager.ensureWorkspace(agent, "../evil", "conv-1"),
            ).resolves.toBe(
                path.join(sandboxRoot, agent.id, "~Li4vZXZpbA", "conv-1"),
            );
            await expect(
                manager.ensureWorkspace(agent, "user-1", ""),
            ).rejects.toThrow(/Unsafe conversationId/);
        });

        test("cleans up partial sandbox when copy fails", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            // Use a non-existent rootPath so cp will fail
            const agent = makeAgent({
                id: "my-agent",
                rootPath: "/nonexistent/source/path",
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await expect(
                manager.ensureWorkspace(agent, "user-1", "conv-1"),
            ).rejects.toThrow();

            // Wait for the promise to settle so cleanup runs
            try {
                await manager.ensureWorkspace(agent, "user-1", "conv-1");
            } catch {
                // expected
            }

            // The partial directory should have been cleaned up
            const sandboxPath = path.join(
                sandboxRoot,
                "my-agent",
                "user-1",
                "conv-1",
            );
            expect(existsSync(sandboxPath)).toBe(false);
        });

        test("rejects source trees containing symlinks", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const outsideDir = makeTempDir("outside");
            const targetPath = path.join(outsideDir, "shared.txt");
            writeFileSync(targetPath, "shared");
            symlinkSync(targetPath, path.join(rootPath, "linked.txt"));

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await expect(
                manager.ensureWorkspace(agent, "user-1", "conv-1"),
            ).rejects.toThrow(/contains symlink/);
            expect(
                existsSync(
                    path.join(sandboxRoot, "my-agent", "user-1", "conv-1"),
                ),
            ).toBe(false);
        });
    });

    describe("deleteWorkspace", () => {
        test("removes a sandbox directory", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({ sandboxRoot, agents: [agent] });
            const manager = createWorkspaceManager(() => config);

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            expect(existsSync(workspace)).toBe(true);

            await manager.deleteWorkspace("my-agent", "user-1", "conv-1");
            expect(existsSync(workspace)).toBe(false);
        });

        test("removes copied workspaces created under an older sandboxRoot", async () => {
            const firstSandboxRoot = makeTempDir("sandbox-a");
            const secondSandboxRoot = makeTempDir("sandbox-b");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({
                sandboxRoot: firstSandboxRoot,
                agents: [agent],
            });
            const rootsRegistryPath = path.join(
                makeTempDir("sandbox-roots-registry"),
                "sandbox-roots.json",
            );
            const manager = new WorkspaceManager({
                getConfig: () => config,
                rootsRegistryPath,
            });

            const originalWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            expect(existsSync(originalWorkspace)).toBe(true);

            config.sandboxRoot = secondSandboxRoot;

            const restartedManager = new WorkspaceManager({
                getConfig: () => config,
                rootsRegistryPath,
            });

            await restartedManager.deleteWorkspace(
                "my-agent",
                "user-1",
                "conv-1",
            );

            expect(existsSync(originalWorkspace)).toBe(false);
            expect(JSON.parse(readFileSync(rootsRegistryPath, "utf8"))).toEqual(
                expect.arrayContaining([
                    path.resolve(firstSandboxRoot),
                    path.resolve(secondSandboxRoot),
                ]),
            );
        });

        test("refuses to delete paths with traversal segments", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const outsideDir = makeTempDir("outside");
            writeFileSync(path.join(outsideDir, "important.txt"), "keep");

            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            // Path traversal is rejected by segment validation
            await expect(
                manager.deleteWorkspace(
                    "../../" + path.basename(outsideDir),
                    "user",
                    "x",
                ),
            ).rejects.toThrow(/Unsafe agentId/);
            expect(existsSync(outsideDir)).toBe(true);
        });

        test("refuses to delete agent rootPath", async () => {
            const sandboxRoot = makeTempDir("sandbox");

            // Construct a config where rootPath happens to be under sandboxRoot
            const agentId = "nested";
            const userId = "user";
            const convId = "conv";
            const nestedRoot = path.join(sandboxRoot, agentId, userId, convId);
            mkdirSync(nestedRoot, { recursive: true });
            writeFileSync(path.join(nestedRoot, "file.txt"), "keep");

            const agent = makeAgent({
                id: agentId,
                rootPath: nestedRoot,
                workspaceMode: "shared",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agent] }),
            );

            await manager.deleteWorkspace(agentId, userId, convId);
            // Should NOT have been deleted because it's the agent's rootPath
            expect(existsSync(nestedRoot)).toBe(true);
        });

        test("refuses to delete workspaces through symlinked ancestors", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const outsideDir = makeTempDir("outside");
            const targetPath = path.join(outsideDir, "conv");
            mkdirSync(targetPath, { recursive: true });
            writeFileSync(path.join(targetPath, "important.txt"), "keep");
            mkdirSync(path.join(sandboxRoot, "agent-a"), { recursive: true });
            symlinkSync(
                outsideDir,
                path.join(sandboxRoot, "agent-a", "user-1"),
            );

            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await manager.deleteWorkspace("agent-a", "user-1", "conv");

            expect(existsSync(path.join(targetPath, "important.txt"))).toBe(
                true,
            );
        });

        test("is a no-op for non-existent directories", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            // Should not throw
            await manager.deleteWorkspace(
                "agent-1",
                "user-1",
                "conv-nonexistent",
            );
        });
    });

    describe("reconcile", () => {
        test("removes sandbox directories not in the active set", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "f.txt"), "x");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({ sandboxRoot, agents: [agent] });
            const manager = createWorkspaceManager(() => config);

            await manager.ensureWorkspace(agent, "user-1", "conv-keep");
            await manager.ensureWorkspace(agent, "user-1", "conv-remove");

            const keepPath = path.join(
                sandboxRoot,
                "agent-a",
                "user-1",
                "conv-keep",
            );
            const removePath = path.join(
                sandboxRoot,
                "agent-a",
                "user-1",
                "conv-remove",
            );
            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(true);

            await manager.reconcile(new Set(["agent-a:user-1:conv-keep"]));

            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(false);
        });

        test("distinguishes matching localIds across agents", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootA = makeTempDir("agent-root-a");
            const rootB = makeTempDir("agent-root-b");
            writeFileSync(path.join(rootA, "a.txt"), "a");
            writeFileSync(path.join(rootB, "b.txt"), "b");

            const agentA = makeAgent({
                id: "agent-a",
                rootPath: rootA,
                workspaceMode: "copy-on-conversation",
            });
            const agentB = makeAgent({
                id: "agent-b",
                rootPath: rootB,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agentA, agentB] }),
            );

            await manager.ensureWorkspace(agentA, "user-1", "conv-1");
            await manager.ensureWorkspace(agentB, "user-1", "conv-1");

            const keepPath = path.join(
                sandboxRoot,
                "agent-a",
                "user-1",
                "conv-1",
            );
            const removePath = path.join(
                sandboxRoot,
                "agent-b",
                "user-1",
                "conv-1",
            );

            await manager.reconcile(new Set(["agent-a:user-1:conv-1"]));

            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(false);
        });

        test("is a no-op when sandboxRoot does not exist", async () => {
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot: "/nonexistent/path" }),
            );

            // Should not throw
            await manager.reconcile(new Set());
        });

        test("removes orphaned workspaces from an older sandboxRoot after restart", async () => {
            const firstSandboxRoot = makeTempDir("sandbox-a");
            const secondSandboxRoot = makeTempDir("sandbox-b");
            const rootPath = makeTempDir("agent-root");
            const rootsRegistryPath = path.join(
                makeTempDir("sandbox-roots-registry"),
                "sandbox-roots.json",
            );
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({
                sandboxRoot: firstSandboxRoot,
                agents: [agent],
            });
            const manager = new WorkspaceManager({
                getConfig: () => config,
                rootsRegistryPath,
            });

            const originalWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            expect(existsSync(originalWorkspace)).toBe(true);

            config.sandboxRoot = secondSandboxRoot;

            const restartedManager = new WorkspaceManager({
                getConfig: () => config,
                rootsRegistryPath,
            });

            await restartedManager.reconcile(new Set());

            expect(existsSync(originalWorkspace)).toBe(false);
        });
    });
});
