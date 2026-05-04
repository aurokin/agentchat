import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const VALIDATE = path.join(REPO_ROOT, "scripts/env/validate.ts");

const FAKE_JWT_PRIVATE_KEY =
    "-----BEGIN PRIVATE KEY----- MIIBIjANBg... -----END PRIVATE KEY-----";
const FAKE_JWKS = '{"keys":[{"use":"sig","kty":"RSA","n":"x","e":"AQAB"}]}';
const FAKE_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");

function makeFixture(): { root: string; cleanup: () => void } {
    const root = fs.realpathSync(
        fs.mkdtempSync(path.join(os.tmpdir(), "agentchat-validate-")),
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    return {
        root,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}

function runValidate(cwd: string): { status: number; output: string } {
    const result = spawnSync("bun", [VALIDATE], {
        cwd,
        env: { ...process.env },
        encoding: "utf8",
    });
    return {
        status: result.status ?? -1,
        output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    };
}

function writeConvexEnv(root: string, content: string): void {
    fs.writeFileSync(path.join(root, ".env.convex.local"), content);
}

describe("env:validate", () => {
    test("fails when .env.convex.local is missing", () => {
        const fixture = makeFixture();
        try {
            const result = runValidate(fixture.root);
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(".env.convex.local");
        } finally {
            fixture.cleanup();
        }
    });

    test("local auth mode skips AUTH_GOOGLE_* keys", () => {
        const fixture = makeFixture();
        try {
            writeConvexEnv(
                fixture.root,
                [
                    "AGENTCHAT_AUTH_MODE=local",
                    "CONVEX_DEPLOYMENT=dev:test",
                    "SITE_URL=https://test.localhost",
                    `JWKS=${FAKE_JWKS}`,
                    `JWT_PRIVATE_KEY=${FAKE_JWT_PRIVATE_KEY}`,
                    `ENCRYPTION_KEY=${FAKE_ENCRYPTION_KEY}`,
                    "",
                ].join("\n"),
            );
            const result = runValidate(fixture.root);
            expect(result.status).toBe(0);
            expect(result.output).toContain("auth mode: local");
        } finally {
            fixture.cleanup();
        }
    });

    test("google auth mode requires AUTH_GOOGLE_* keys", () => {
        const fixture = makeFixture();
        try {
            writeConvexEnv(
                fixture.root,
                [
                    "AGENTCHAT_AUTH_MODE=google",
                    "CONVEX_DEPLOYMENT=dev:test",
                    "SITE_URL=https://test.localhost",
                    `JWKS=${FAKE_JWKS}`,
                    `JWT_PRIVATE_KEY=${FAKE_JWT_PRIVATE_KEY}`,
                    `ENCRYPTION_KEY=${FAKE_ENCRYPTION_KEY}`,
                    "",
                ].join("\n"),
            );
            const result = runValidate(fixture.root);
            expect(result.status).not.toBe(0);
            expect(result.output).toContain("AUTH_GOOGLE_ID");
            expect(result.output).toContain("AUTH_GOOGLE_SECRET");
        } finally {
            fixture.cleanup();
        }
    });

    test("rejects unsupported auth mode values", () => {
        const fixture = makeFixture();
        try {
            writeConvexEnv(
                fixture.root,
                [
                    "AGENTCHAT_AUTH_MODE=locla",
                    "CONVEX_DEPLOYMENT=dev:test",
                    "SITE_URL=https://test.localhost",
                    "AUTH_GOOGLE_ID=test-google-id",
                    "AUTH_GOOGLE_SECRET=test-google-secret",
                    `JWKS=${FAKE_JWKS}`,
                    `JWT_PRIVATE_KEY=${FAKE_JWT_PRIVATE_KEY}`,
                    `ENCRYPTION_KEY=${FAKE_ENCRYPTION_KEY}`,
                    "",
                ].join("\n"),
            );
            const result = runValidate(fixture.root);
            expect(result.status).not.toBe(0);
            expect(result.output).toContain("AGENTCHAT_AUTH_MODE");
            expect(result.output).toContain('expected "google" or "local"');
        } finally {
            fixture.cleanup();
        }
    });
});
