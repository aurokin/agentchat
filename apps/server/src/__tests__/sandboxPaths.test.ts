import { describe, expect, test } from "bun:test";

import {
    assertSafePathSegment,
    getSandboxConversationPathSegment,
    getSandboxUserPathSegment,
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

    test("encodes unsafe conversation ids when building sandbox paths", () => {
        expect(getSandboxConversationPathSegment("frontend:api")).toBe(
            "~ZnJvbnRlbmQ6YXBp",
        );
        expect(getSandboxConversationPathSegment("../chat")).toBe(
            "~Li4vY2hhdA",
        );
        expect(() => getSandboxConversationPathSegment("")).toThrow(
            /Unsafe conversationId/,
        );
        expect(
            getSandboxWorkspacePath({
                sandboxRoot: "/tmp/sandboxes",
                agentId: "agent-1",
                userId: "user-1",
                conversationId: "frontend:api",
            }),
        ).toBe("/tmp/sandboxes/agent-1/user-1/~ZnJvbnRlbmQ6YXBp");
    });

    test("encodes Convex-style user ids for filesystem paths", () => {
        expect(getSandboxUserPathSegment("users:abc123")).toBe(
            "~dXNlcnM6YWJjMTIz",
        );
        expect(
            getSandboxWorkspacePath({
                sandboxRoot: "/tmp/sandboxes",
                agentId: "agent-1",
                userId: "users:abc123",
                conversationId: "chat-1",
            }),
        ).toBe("/tmp/sandboxes/agent-1/~dXNlcnM6YWJjMTIz/chat-1");
    });
});
