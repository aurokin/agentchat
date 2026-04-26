import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
    buildDevManifest,
    deriveLaneStateRoot,
    laneStateRootsForCheckout,
    loadLocalManifest,
    resolveManifestPath,
    saveLocalManifest,
    tryLoadLocalManifest,
} from "../local/lib/manifest.ts";
import type { LocalManifest } from "../local/lib/model.ts";

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

function createCheckoutPath(): string {
    const checkoutPath = fs.mkdtempSync(
        path.join(os.tmpdir(), "agentchat-manifest-test-"),
    );
    tempDirs.push(checkoutPath);
    return checkoutPath;
}

function createManifest(checkoutPath: string): LocalManifest {
    return buildDevManifest({
        checkoutPath,
        convexDeployment: null,
        convexCloudUrl: null,
        convexSiteUrl: null,
        managedWebEnv: {
            host: "127.0.0.1",
            nextPublicConvexUrl: null,
            nextAllowedDevOrigins: null,
        },
        managedServerEnv: {
            host: "127.0.0.1",
            backendTokenSecret: "secret",
            agentchatConvexSiteUrl: "https://example.test",
            runtimeIngressSecret: "runtime-secret",
        },
        serverConfig: {},
    });
}

function writeManifest(manifest: LocalManifest): void {
    const manifestPath = resolveManifestPath(manifest.checkoutPath);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
}

describe("loadLocalManifest", () => {
    test("rejects a manifest with an unsafe xdgStateHome", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);
        manifest.xdgStateHome = path.join(os.homedir(), ".ssh", "xdg");
        writeManifest(manifest);

        expect(() => loadLocalManifest(checkoutPath)).toThrow(
            "xdgStateHome must resolve inside",
        );
    });

    test("tryLoadLocalManifest fails closed for an unsafe xdgStateHome", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);
        manifest.xdgStateHome = path.join(path.sep, "tmp", "xdg");
        writeManifest(manifest);

        const errors: string[] = [];
        expect(
            tryLoadLocalManifest(checkoutPath, {
                onError: (error) => errors.push(error.message),
            }),
        ).toBeNull();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("xdgStateHome must resolve inside");
    });
});

describe("saveLocalManifest", () => {
    test("does not rewrite an unchanged manifest just to bump updatedAt", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);

        saveLocalManifest(manifest);
        const manifestPath = resolveManifestPath(checkoutPath);
        const firstStat = fs.statSync(manifestPath);

        saveLocalManifest(manifest);
        const secondStat = fs.statSync(manifestPath);

        expect(secondStat.ino).toBe(firstStat.ino);
        expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    });

    test("rewrites the manifest when substantive values change", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);

        saveLocalManifest(manifest);
        const manifestPath = resolveManifestPath(checkoutPath);
        const firstStat = fs.statSync(manifestPath);

        saveLocalManifest({
            ...manifest,
            webPort: manifest.webPort + 1,
        });
        const secondStat = fs.statSync(manifestPath);

        expect(secondStat.ino).not.toBe(firstStat.ino);
        expect(loadLocalManifest(checkoutPath)?.webPort).toBe(
            manifest.webPort + 1,
        );
    });
});

describe("laneStateRootsForCheckout", () => {
    test("ignores invalid manifest lane roots and keeps the derived root", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);
        manifest.xdgStateHome = path.join(path.sep, "tmp", "xdg");

        expect(laneStateRootsForCheckout(checkoutPath, manifest)).toEqual([
            deriveLaneStateRoot(checkoutPath),
        ]);
    });

    test("includes the manifest lane root when it is valid", () => {
        const checkoutPath = createCheckoutPath();
        const manifest = createManifest(checkoutPath);

        expect(laneStateRootsForCheckout(checkoutPath, manifest)).toEqual([
            deriveLaneStateRoot(checkoutPath),
        ]);
    });
});
