import { afterEach, describe, expect, test } from "bun:test";

import { getAgentchatAuthMode, isAgentchatLocalAuth } from "../lib/auth_mode";

const originalEnv = {
    AGENTCHAT_AUTH_MODE: process.env.AGENTCHAT_AUTH_MODE,
};

afterEach(() => {
    process.env.AGENTCHAT_AUTH_MODE = originalEnv.AGENTCHAT_AUTH_MODE;
});

describe("auth mode", () => {
    test("defaults to google auth mode", () => {
        delete process.env.AGENTCHAT_AUTH_MODE;

        expect(getAgentchatAuthMode()).toBe("google");
    });

    test("reads local auth mode", () => {
        process.env.AGENTCHAT_AUTH_MODE = "local";

        expect(getAgentchatAuthMode()).toBe("local");
        expect(isAgentchatLocalAuth()).toBe(true);
    });
});
