import { describe, expect, test } from "bun:test";

import { toAgentchatServerIssue } from "@/lib/server-issues";

describe("toAgentchatServerIssue", () => {
    test("formats bootstrap errors with an explicit title", () => {
        expect(
            toAgentchatServerIssue({
                scope: "bootstrap",
                error: new Error("Agentchat server request failed (500)"),
            }),
        ).toEqual({
            title: "Failed to load the Agentchat server bootstrap.",
            detail: "Agentchat server request failed (500)",
        });
    });

    test("formats agent option errors with fallback detail", () => {
        expect(
            toAgentchatServerIssue({
                scope: "agentOptions",
                error: null,
            }),
        ).toEqual({
            title: "Failed to load the selected agent options.",
            detail: "The selected agent's provider, model, or variant defaults could not be loaded.",
        });
    });

    test("formats model catalog errors from string values", () => {
        expect(
            toAgentchatServerIssue({
                scope: "models",
                error: "NEXT_PUBLIC_AGENTCHAT_SERVER_URL is not configured.",
            }),
        ).toEqual({
            title: "Failed to load the provider model catalog.",
            detail: "NEXT_PUBLIC_AGENTCHAT_SERVER_URL is not configured.",
        });
    });
});
