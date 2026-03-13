import { describe, expect, test } from "bun:test";

import { toAgentchatWebSocketUrl } from "../agentchat-socket";

describe("agentchat socket helpers", () => {
    test("maps http urls to websocket urls", () => {
        expect(toAgentchatWebSocketUrl("http://localhost:3030")).toBe(
            "ws://localhost:3030/ws",
        );
    });

    test("maps https urls to secure websocket urls", () => {
        expect(
            toAgentchatWebSocketUrl("https://agentchat.example.com/base/path"),
        ).toBe("wss://agentchat.example.com/ws");
    });
});
