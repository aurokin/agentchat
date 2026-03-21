import {
    existsSync,
    lstatSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
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
    getWorkspaceActiveKey,
    getWorkspaceMetadataRootPath,
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
    stateId?: string;
    instanceKey?: string;
}): AgentchatConfig {
    return {
        version: 1,
        stateId: overrides.stateId ?? "test-state",
        instanceKey: overrides.instanceKey ?? "instance-test",
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

function createDeferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function waitFor(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error("Timed out waiting for condition");
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("WorkspaceManager", () => {
    test("keeps the sandbox root registry path stable for the same state id", () => {
        const originalXdgStateHome = process.env.XDG_STATE_HOME;
        try {
            process.env.XDG_STATE_HOME = "/tmp/agentchat-state-home";
            const releaseAPath = getSandboxRootsRegistryPath("agentchat-prod");
            const releaseBPath = getSandboxRootsRegistryPath("agentchat-prod");
            const stagingPath = getSandboxRootsRegistryPath("agentchat-stage");
            const stateDir = path.join(
                "/tmp/agentchat-state-home",
                "agentchat",
                ".agentchat-state",
                "sandbox-roots",
            );

            expect(path.dirname(releaseAPath)).toBe(stateDir);
            expect(path.dirname(releaseBPath)).toBe(stateDir);
            expect(path.dirname(stagingPath)).toBe(stateDir);
            expect(releaseAPath).toBe(releaseBPath);
            expect(releaseAPath).not.toBe(stagingPath);
            expect(releaseAPath).toStartWith("/tmp/agentchat-state-home/");
            expect(getSandboxRootsRegistryPath("agentchat-prod")).toBe(
                releaseAPath,
            );
        } finally {
            if (originalXdgStateHome === undefined) {
                delete process.env.XDG_STATE_HOME;
            } else {
                process.env.XDG_STATE_HOME = originalXdgStateHome;
            }
        }
    });

    test("tracks active sandbox roots for parallel instances under one state id", () => {
        const rootsRegistryPath = path.join(
            makeTempDir("sandbox-roots-registry"),
            "sandbox-roots.json",
        );
        const releaseARoot = makeTempDir("sandbox-a");
        const releaseBRoot = makeTempDir("sandbox-b");
        const releaseAConfig = makeConfig({
            sandboxRoot: releaseARoot,
            agents: [
                makeAgent({
                    id: "copy-agent",
                    workspaceMode: "copy-on-conversation",
                }),
            ],
            stateId: "shared-install",
            instanceKey: "instance-a",
        });
        const releaseBConfig = makeConfig({
            sandboxRoot: releaseBRoot,
            agents: [
                makeAgent({
                    id: "copy-agent",
                    workspaceMode: "shared",
                }),
            ],
            stateId: "shared-install",
            instanceKey: "instance-b",
        });
        const releaseAManager = new WorkspaceManager({
            getConfig: () => releaseAConfig,
            rootsRegistryPath,
        });
        const releaseBManager = new WorkspaceManager({
            getConfig: () => releaseBConfig,
            rootsRegistryPath,
        });

        const expectedRoots = [releaseARoot, releaseBRoot].sort((left, right) =>
            left.localeCompare(right),
        );

        expect(releaseAManager.listCurrentSandboxRoots()).toEqual(
            expectedRoots,
        );
        expect(
            releaseAManager.listCurrentCopyOnConversationSandboxRootsByAgent(),
        ).toEqual({
            "copy-agent": [releaseARoot],
        });
        expect(releaseBManager.listCurrentSandboxRoots()).toEqual(
            [releaseARoot, releaseBRoot].sort((left, right) =>
                left.localeCompare(right),
            ),
        );
        expect(releaseAManager.listCurrentSandboxRoots()).toEqual(
            expectedRoots,
        );
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
            const rootsRegistryPath = path.join(
                makeTempDir("sandbox-roots-registry"),
                "sandbox-roots.json",
            );
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
                rootsRegistryPath,
            });

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
            expect(
                existsSync(path.join(result, ".agentchat-sandbox.json")),
            ).toBe(false);
            expect(
                readdirSync(getWorkspaceMetadataRootPath(sandboxRoot)).length,
            ).toBe(1);
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

        test("does not reset a copied workspace when the agent rootPath changes only by symlink alias", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const realRoot = makeTempDir("agent-root");
            const aliasParent = makeTempDir("agent-root-alias");
            const aliasedRoot = path.join(aliasParent, "linked-root");
            symlinkSync(realRoot, aliasedRoot);
            writeFileSync(path.join(realRoot, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath: realRoot,
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
            writeFileSync(path.join(first.path, "file.txt"), "modified");

            const second = await manager.ensureWorkspaceState(
                { ...agent, rootPath: aliasedRoot },
                "user-1",
                "conv-1",
            );

            expect(second.wasReset).toBe(false);
            expect(second.path).toBe(first.path);
            expect(
                readFileSync(path.join(second.path, "file.txt"), "utf8"),
            ).toBe("modified");
        });

        test("copies symlinked agent roots by dereferencing the root alias", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const realRoot = makeTempDir("agent-root");
            const aliasParent = makeTempDir("agent-root-alias");
            const aliasedRoot = path.join(aliasParent, "linked-root");
            symlinkSync(realRoot, aliasedRoot);
            writeFileSync(path.join(realRoot, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath: aliasedRoot,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const workspace = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspace.wasReset).toBe(false);
            expect(
                readFileSync(path.join(workspace.path, "file.txt"), "utf8"),
            ).toBe("source");
            expect(lstatSync(workspace.path).isSymbolicLink()).toBe(false);
        });

        test("recreates an existing copied sandbox when the target becomes a symlink", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const outsideDir = makeTempDir("outside");
            writeFileSync(path.join(rootPath, "file.txt"), "safe");
            writeFileSync(path.join(outsideDir, "file.txt"), "outside");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
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
            rmSync(first.path, { recursive: true, force: true });
            symlinkSync(outsideDir, first.path);

            const second = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(second.wasReset).toBe(true);
            expect(lstatSync(second.path).isSymbolicLink()).toBe(false);
            expect(
                readFileSync(path.join(second.path, "file.txt"), "utf8"),
            ).toBe("safe");
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

            await Bun.sleep(0);
            await Bun.sleep(0);
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

        test("serializes managed workspace registry updates for the same sandbox root", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );
            const workspacePathA = manager.getWorkspacePath(
                "test-agent",
                "user-1",
                "conv-1",
            );
            const workspacePathB = manager.getWorkspacePath(
                "test-agent",
                "user-1",
                "conv-2",
            );
            const gate = createDeferred<void>();
            let firstWriteStarted = false;
            const managerInternals = manager as unknown as {
                recordManagedWorkspace: (sandboxPath: string) => Promise<void>;
                readManagedWorkspaceRegistry: (workspacePathInfo: {
                    sandboxRoot: string;
                }) => Promise<Set<string>>;
                writeManagedWorkspaceRegistry: (
                    workspacePathInfo: {
                        sandboxRoot: string;
                    },
                    registry: Set<string>,
                ) => Promise<void>;
            };
            const originalWriteRegistry =
                managerInternals.writeManagedWorkspaceRegistry.bind(manager);
            managerInternals.writeManagedWorkspaceRegistry = async (
                workspacePathInfo,
                registry,
            ) => {
                if (!firstWriteStarted) {
                    firstWriteStarted = true;
                    await gate.promise;
                }
                await originalWriteRegistry(workspacePathInfo, registry);
            };

            const firstRecord =
                managerInternals.recordManagedWorkspace(workspacePathA);
            await waitFor(() => firstWriteStarted);
            const secondRecord =
                managerInternals.recordManagedWorkspace(workspacePathB);
            gate.resolve();
            await Promise.all([firstRecord, secondRecord]);

            const registry =
                await managerInternals.readManagedWorkspaceRegistry({
                    sandboxRoot,
                });
            expect(
                [...registry].sort((left, right) => left.localeCompare(right)),
            ).toEqual(
                [workspacePathA, workspacePathB].sort((left, right) =>
                    left.localeCompare(right),
                ),
            );
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

        test("encodes filesystem-unsafe conversation ids", async () => {
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
            ).resolves.toBe(
                path.join(
                    sandboxRoot,
                    agent.id,
                    "user-1",
                    "~Li4vLi4vLi4vdG1wL2V2aWw",
                ),
            );
            await expect(
                manager.ensureWorkspace(agent, "user-1", ".."),
            ).resolves.toBe(path.join(sandboxRoot, agent.id, "user-1", "~Li4"));
            await expect(
                manager.ensureWorkspace(agent, "user-1", "."),
            ).resolves.toBe(path.join(sandboxRoot, agent.id, "user-1", "~Lg"));
            await expect(
                manager.ensureWorkspace(agent, "user-1", "conversations:123"),
            ).resolves.toBe(
                path.join(
                    sandboxRoot,
                    agent.id,
                    "user-1",
                    "~Y29udmVyc2F0aW9uczoxMjM",
                ),
            );
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

        test("refuses to reuse unmanaged existing directories without metadata", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const otherRoot = makeTempDir("other-root");
            const sandboxPath = path.join(
                sandboxRoot,
                "my-agent",
                "user-1",
                "conv-1",
            );
            mkdirSync(sandboxPath, { recursive: true });
            writeFileSync(path.join(sandboxPath, "file.txt"), "unmanaged");
            writeFileSync(path.join(rootPath, "file.txt"), "source");
            writeFileSync(path.join(otherRoot, "file.txt"), "other");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );
            await manager.ensureWorkspace(
                makeAgent({
                    id: "other-agent",
                    rootPath: otherRoot,
                    workspaceMode: "copy-on-conversation",
                }),
                "user-1",
                "conv-other",
            );

            await expect(
                manager.ensureWorkspace(agent, "user-1", "conv-1"),
            ).rejects.toThrow(/without metadata/);
            expect(
                readFileSync(path.join(sandboxPath, "file.txt"), "utf8"),
            ).toBe("unmanaged");
        });

        test("recreates copied workspaces when their metadata state is wiped", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            const rootsRegistryPath = path.join(
                makeTempDir("sandbox-roots-registry"),
                "sandbox-roots.json",
            );
            writeFileSync(path.join(rootPath, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = new WorkspaceManager({
                getConfig: () => makeConfig({ sandboxRoot }),
                rootsRegistryPath,
            });

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            writeFileSync(path.join(workspace, "file.txt"), "stale");
            rmSync(getWorkspaceMetadataRootPath(sandboxRoot), {
                force: true,
                recursive: true,
            });

            const workspaceState = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspaceState.path).toBe(workspace);
            expect(workspaceState.wasReset).toBe(true);
            expect(readFileSync(path.join(workspace, "file.txt"), "utf8")).toBe(
                "source",
            );
        });

        test("recreates a copied workspace when only its metadata file is missing and other sandboxes still exist", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const firstWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            const secondWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-2",
            );
            writeFileSync(path.join(firstWorkspace, "file.txt"), "stale");

            const metadataRoot = getWorkspaceMetadataRootPath(sandboxRoot);
            expect(readdirSync(metadataRoot)).toHaveLength(2);
            const firstWorkspaceMetadataPath = (
                manager as unknown as {
                    getWorkspaceMetadataPath: (sandboxPath: string) => string;
                }
            ).getWorkspaceMetadataPath(firstWorkspace);
            rmSync(firstWorkspaceMetadataPath, { force: true });

            const workspaceState = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspaceState.path).toBe(firstWorkspace);
            expect(workspaceState.wasReset).toBe(true);
            expect(
                readFileSync(path.join(firstWorkspace, "file.txt"), "utf8"),
            ).toBe("source");
            expect(existsSync(secondWorkspace)).toBe(true);
        });

        test("recreates copied workspaces with incomplete metadata", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            writeFileSync(path.join(workspace, "file.txt"), "stale");
            const metadataRoot = getWorkspaceMetadataRootPath(sandboxRoot);
            const metadataFiles = readdirSync(metadataRoot);
            expect(metadataFiles).toHaveLength(1);
            const metadataFile = metadataFiles[0]!;
            writeFileSync(
                path.join(metadataRoot, metadataFile),
                JSON.stringify(
                    {
                        sourceRootPath: rootPath,
                        state: "creating",
                    },
                    null,
                    2,
                ) + "\n",
            );

            const workspaceState = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspaceState.path).toBe(workspace);
            expect(workspaceState.wasReset).toBe(true);
            expect(readFileSync(path.join(workspace, "file.txt"), "utf8")).toBe(
                "source",
            );
        });

        test("reports reset when recreating a missing copied workspace from metadata", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            rmSync(workspace, { force: true, recursive: true });

            const workspaceState = await manager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspaceState.path).toBe(workspace);
            expect(workspaceState.wasReset).toBe(true);
            expect(readFileSync(path.join(workspace, "file.txt"), "utf8")).toBe(
                "source",
            );
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
            expect(
                JSON.parse(readFileSync(rootsRegistryPath, "utf8")),
            ).toMatchObject({
                roots: expect.arrayContaining([
                    path.resolve(firstSandboxRoot),
                    path.resolve(secondSandboxRoot),
                ]),
            });
        });

        test("keeps metadata lookup stable when sandboxRoot changes only by symlink alias", async () => {
            const realSandboxRoot = makeTempDir("sandbox-real");
            const aliasParent = makeTempDir("sandbox-alias");
            const aliasedSandboxRoot = path.join(aliasParent, "linked-sandbox");
            symlinkSync(realSandboxRoot, aliasedSandboxRoot);
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "source");

            const agent = makeAgent({
                id: "my-agent",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const rootsRegistryPath = path.join(
                makeTempDir("sandbox-roots-registry"),
                "sandbox-roots.json",
            );
            const config = makeConfig({
                sandboxRoot: aliasedSandboxRoot,
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
            writeFileSync(path.join(originalWorkspace, "file.txt"), "modified");

            config.sandboxRoot = realSandboxRoot;

            const restartedManager = new WorkspaceManager({
                getConfig: () => config,
                rootsRegistryPath,
            });
            const workspaceState = await restartedManager.ensureWorkspaceState(
                agent,
                "user-1",
                "conv-1",
            );

            expect(workspaceState.wasReset).toBe(false);
            expect(
                readFileSync(
                    path.join(workspaceState.path, "file.txt"),
                    "utf8",
                ),
            ).toBe("modified");
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

        test("refuses to delete agent rootPath through a symlink alias", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const aliasDir = makeTempDir("workspace-alias");
            const agentId = "nested";
            const userId = "user";
            const convId = "conv";
            const nestedRoot = path.join(sandboxRoot, agentId, userId, convId);
            mkdirSync(nestedRoot, { recursive: true });
            writeFileSync(path.join(nestedRoot, "file.txt"), "keep");
            const aliasPath = path.join(aliasDir, "root-alias");
            symlinkSync(nestedRoot, aliasPath);

            const agent = makeAgent({
                id: agentId,
                rootPath: aliasPath,
                workspaceMode: "shared",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agent] }),
            );

            await manager.deleteWorkspace(agentId, userId, convId);

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

        test("refuses to delete unmanaged directories without sandbox metadata", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const unmanagedPath = path.join(
                sandboxRoot,
                "agent-a",
                "user-1",
                "conv-1",
            );
            mkdirSync(unmanagedPath, { recursive: true });
            writeFileSync(path.join(unmanagedPath, "keep.txt"), "keep");

            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await manager.deleteWorkspace("agent-a", "user-1", "conv-1");

            expect(existsSync(unmanagedPath)).toBe(true);
            expect(
                readFileSync(path.join(unmanagedPath, "keep.txt"), "utf8"),
            ).toBe("keep");
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

            await manager.reconcile(
                new Set([
                    getWorkspaceActiveKey({
                        sandboxRoot,
                        agentId: "agent-a",
                        userId: "user-1",
                        conversationId: "conv-keep",
                    }),
                ]),
            );

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

            await manager.reconcile(
                new Set([
                    getWorkspaceActiveKey({
                        sandboxRoot,
                        agentId: "agent-a",
                        userId: "user-1",
                        conversationId: "conv-1",
                    }),
                ]),
            );

            expect(existsSync(keepPath)).toBe(true);
            expect(existsSync(removePath)).toBe(false);
        });

        test("keeps active workspaces with encoded user and conversation path segments", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "f.txt"), "x");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agent] }),
            );

            const workspace = await manager.ensureWorkspace(
                agent,
                "users:test",
                "chats:2",
            );

            await manager.reconcile(
                new Set([
                    getWorkspaceActiveKey({
                        sandboxRoot,
                        agentId: "agent-a",
                        userId: "users:test",
                        conversationId: "chats:2",
                    }),
                ]),
            );

            expect(existsSync(workspace)).toBe(true);
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

        test("removes stale old-root workspaces after sandboxRoot migration even when the chat still exists", async () => {
            const firstSandboxRoot = makeTempDir("sandbox-a");
            const secondSandboxRoot = makeTempDir("sandbox-b");
            const rootPath = makeTempDir("agent-root");
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
            const manager = createWorkspaceManager(() => config);

            const oldWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );

            config.sandboxRoot = secondSandboxRoot;
            const newWorkspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );

            await manager.reconcile(
                new Set([
                    getWorkspaceActiveKey({
                        sandboxRoot: secondSandboxRoot,
                        agentId: "agent-a",
                        userId: "user-1",
                        conversationId: "conv-1",
                    }),
                ]),
            );

            expect(existsSync(oldWorkspace)).toBe(false);
            expect(existsSync(newWorkspace)).toBe(true);
        });

        test("refuses to remove orphaned workspaces that overlap an agent rootPath", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const copiedAgent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const config = makeConfig({
                sandboxRoot,
                agents: [copiedAgent],
            });
            const manager = createWorkspaceManager(() => config);

            const workspace = await manager.ensureWorkspace(
                copiedAgent,
                "user-1",
                "conv-1",
            );
            expect(existsSync(workspace)).toBe(true);

            config.agents = [
                copiedAgent,
                makeAgent({
                    id: "shared-agent",
                    rootPath: workspace,
                    workspaceMode: "shared",
                }),
            ];

            await manager.reconcile(new Set());

            expect(existsSync(workspace)).toBe(true);
        });

        test("refuses to remove unmanaged directories during reconciliation", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const unmanagedPath = path.join(
                sandboxRoot,
                "agent-a",
                "user-1",
                "conv-1",
            );
            mkdirSync(unmanagedPath, { recursive: true });
            writeFileSync(path.join(unmanagedPath, "keep.txt"), "keep");

            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot }),
            );

            await manager.reconcile(new Set());

            expect(existsSync(unmanagedPath)).toBe(true);
            expect(
                readFileSync(path.join(unmanagedPath, "keep.txt"), "utf8"),
            ).toBe("keep");
        });

        test("keeps workspaces that are still being created during reconciliation", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agent] }),
            );

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            (
                manager as unknown as {
                    pendingWorkspaceCreations: Map<
                        string,
                        Promise<{ path: string; wasReset: boolean }>
                    >;
                }
            ).pendingWorkspaceCreations.set(
                getWorkspaceActiveKey({
                    sandboxRoot,
                    agentId: "agent-a",
                    userId: "user-1",
                    conversationId: "conv-1",
                }),
                new Promise(() => {}),
            );

            await manager.reconcile(new Set());

            expect(existsSync(workspace)).toBe(true);
        });

        test("keeps workspaces that were touched after reconciliation started", async () => {
            const sandboxRoot = makeTempDir("sandbox");
            const rootPath = makeTempDir("agent-root");
            writeFileSync(path.join(rootPath, "file.txt"), "data");

            const agent = makeAgent({
                id: "agent-a",
                rootPath,
                workspaceMode: "copy-on-conversation",
            });
            const manager = createWorkspaceManager(() =>
                makeConfig({ sandboxRoot, agents: [agent] }),
            );

            const workspace = await manager.ensureWorkspace(
                agent,
                "user-1",
                "conv-1",
            );
            const workspaceKey = getWorkspaceActiveKey({
                sandboxRoot,
                agentId: "agent-a",
                userId: "user-1",
                conversationId: "conv-1",
            });
            const reconcileStartedAt = Date.now() - 1;
            (
                manager as unknown as {
                    recentWorkspaceTouches: Map<string, number>;
                }
            ).recentWorkspaceTouches.set(workspaceKey, Date.now() + 1_000);

            await manager.reconcile(new Set());

            expect(existsSync(workspace)).toBe(true);
            expect(
                (
                    manager as unknown as {
                        recentWorkspaceTouches: Map<string, number>;
                    }
                ).recentWorkspaceTouches.get(workspaceKey),
            ).toBeGreaterThanOrEqual(reconcileStartedAt);
        });
    });
});
