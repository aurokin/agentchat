import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const SYNC_SECRETS = path.join(REPO_ROOT, "scripts/env/sync-secrets.ts");

function makeFixture(): { root: string; cleanup: () => void } {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "agentchat-sync-secrets-")),
    );
    fs.mkdirSync(path.join(root, "apps", "server"), { recursive: true });
    return {
        root,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

function run(cwd: string): { status: number; output: string } {
    const result = spawnSync("bun", [SYNC_SECRETS], {
        cwd,
        env: { ...process.env },
        encoding: "utf8",
    });
    return {
        status: result.status ?? -1,
        output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
}

function readEnv(absPath: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const raw of fs.readFileSync(absPath, "utf8").split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
    return out;
}

describe("env:sync-secrets", () => {
    test("errors when .env.convex.local missing", () => {
        const fixture = makeFixture();
        try {
            const result = run(fixture.root);
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(".env.convex.local");
        } finally {
            fixture.cleanup();
        }
    });

    test("appends both keys from apps/server/.env.local without rotating", () => {
        const fixture = makeFixture();
        try {
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:test\n",
            );
            fs.writeFileSync(
                path.join(fixture.root, "apps/server/.env.local"),
                [
                    "BACKEND_TOKEN_SECRET=existing-backend-token",
                    "RUNTIME_INGRESS_SECRET=existing-runtime-token",
                    "",
                ].join("\n"),
            );

            const result = run(fixture.root);
            expect(result.status).toBe(0);

            const merged = readEnv(
                path.join(fixture.root, ".env.convex.local"),
            );
            expect(merged.BACKEND_TOKEN_SECRET).toBe("existing-backend-token");
            expect(merged.RUNTIME_INGRESS_SECRET).toBe(
                "existing-runtime-token",
            );
        } finally {
            fixture.cleanup();
        }
    });

    test("is idempotent when keys already present in .env.convex.local", () => {
        const fixture = makeFixture();
        try {
            const initial = [
                "CONVEX_DEPLOYMENT=dev:test",
                "BACKEND_TOKEN_SECRET=already-here",
                "RUNTIME_INGRESS_SECRET=already-here",
                "",
            ].join("\n");
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                initial,
            );
            // Server has different values; sync-secrets must NOT overwrite.
            fs.writeFileSync(
                path.join(fixture.root, "apps/server/.env.local"),
                [
                    "BACKEND_TOKEN_SECRET=server-side-different",
                    "RUNTIME_INGRESS_SECRET=server-side-different",
                    "",
                ].join("\n"),
            );

            const result = run(fixture.root);
            expect(result.status).toBe(0);
            expect(result.output).toContain("nothing to do");

            const after = fs.readFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "utf8",
            );
            expect(after).toBe(initial);
        } finally {
            fixture.cleanup();
        }
    });

    test("errors clearly when neither side has the secrets", () => {
        const fixture = makeFixture();
        try {
            fs.writeFileSync(
                path.join(fixture.root, ".env.convex.local"),
                "CONVEX_DEPLOYMENT=dev:test\n",
            );

            const result = run(fixture.root);
            expect(result.status).not.toBe(0);
            expect(result.output).toContain("BACKEND_TOKEN_SECRET");
            expect(result.output).toContain("RUNTIME_INGRESS_SECRET");
            expect(result.output).toContain("convex:gen-secrets");
        } finally {
            fixture.cleanup();
        }
    });
});
