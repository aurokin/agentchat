import { describe, expect, test } from "bun:test";

import {
    assertSafePathSegment,
    getSandboxWorkspacePath,
    isSafePathSegment,
} from "../sandboxPaths.ts";

describe("sandbox paths", () => {
    test("accepts normal filesystem path segments", () => {
        expect(isSafePathSegment("agent-1")).toBe(true);
        expect(isSafePathSegment("chat_123")).toBe(true);
    });

    test.each([
        ".",
        "..",
        "frontend:api",
        "CON",
        "nul.txt",
        "name.",
        "name ",
        "has/slash",
    ])("rejects unsafe segment %p", (value) => {
        expect(isSafePathSegment(value)).toBe(false);
        expect(() => assertSafePathSegment("agentId", value)).toThrow(
            /Unsafe agentId/,
        );
    });

    test("rejects unsafe conversation ids when building sandbox paths", () => {
        expect(() =>
            getSandboxWorkspacePath({
                sandboxRoot: "/tmp/sandboxes",
                agentId: "agent-1",
                userId: "user-1",
                conversationId: "frontend:api",
            }),
        ).toThrow(/Unsafe conversationId/);
    });
});
