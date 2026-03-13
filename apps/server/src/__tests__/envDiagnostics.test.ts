import { describe, expect, test } from "bun:test";

import { getRuntimeEnvDiagnostics } from "../envDiagnostics.ts";

describe("getRuntimeEnvDiagnostics", () => {
    test("reports success when all required runtime env vars are present", () => {
        const result = getRuntimeEnvDiagnostics({
            BACKEND_TOKEN_SECRET: "backend-secret",
            AGENTCHAT_CONVEX_SITE_URL: "https://example.convex.site",
            RUNTIME_INGRESS_SECRET: "runtime-secret",
        });

        expect(result.ok).toBe(true);
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                key: "BACKEND_TOKEN_SECRET",
                configured: true,
            }),
            expect.objectContaining({
                key: "AGENTCHAT_CONVEX_SITE_URL",
                configured: true,
            }),
            expect.objectContaining({
                key: "RUNTIME_INGRESS_SECRET",
                configured: true,
            }),
        ]);
    });

    test("reports missing runtime env vars explicitly", () => {
        const result = getRuntimeEnvDiagnostics({
            BACKEND_TOKEN_SECRET: "  ",
            AGENTCHAT_CONVEX_SITE_URL: undefined,
            RUNTIME_INGRESS_SECRET: "runtime-secret",
        });

        expect(result.ok).toBe(false);
        expect(result.diagnostics).toEqual([
            expect.objectContaining({
                key: "BACKEND_TOKEN_SECRET",
                configured: false,
            }),
            expect.objectContaining({
                key: "AGENTCHAT_CONVEX_SITE_URL",
                configured: false,
            }),
            expect.objectContaining({
                key: "RUNTIME_INGRESS_SECRET",
                configured: true,
            }),
        ]);
    });
});
