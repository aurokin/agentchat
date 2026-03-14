import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseConfig } from "../config.ts";
import { createFetchHandler } from "../http.ts";

const exampleConfigPath = path.resolve(
    import.meta.dir,
    "..",
    "..",
    "agentchat.config.example.json",
);
const exampleConfig = parseConfig(
    JSON.parse(readFileSync(exampleConfigPath, "utf8")) as unknown,
);

describe("server config", () => {
    test("parses the example config", () => {
        expect(exampleConfig.version).toBe(1);
        expect(exampleConfig.providers).toHaveLength(1);
        expect(exampleConfig.agents).toHaveLength(1);
        expect(exampleConfig.agents[0]?.defaultProviderId).toBe("codex-main");
        expect(exampleConfig.providers[0]?.models[0]?.id).toBe("gpt-5.4");
    });

    test("serves bootstrap, provider models, and agent options routes", async () => {
        const fetch = createFetchHandler({
            getConfig: () => exampleConfig,
        });

        const bootstrapResponse = await fetch(
            new Request("http://localhost/api/bootstrap"),
        );
        expect(bootstrapResponse.status).toBe(200);
        const bootstrap = (await bootstrapResponse.json()) as {
            auth: {
                mode: "google" | "disabled";
                allowlistMode: "email" | null;
            };
            agents: Array<{ id: string }>;
            providers: Array<{ id: string }>;
        };
        expect(bootstrap.auth).toEqual({
            mode: "google",
            allowlistMode: "email",
        });
        expect(bootstrap.agents[0]?.id).toBe("example-agent");
        expect(bootstrap.providers[0]?.id).toBe("codex-main");

        const modelsResponse = await fetch(
            new Request("http://localhost/api/providers/codex-main/models"),
        );
        expect(modelsResponse.status).toBe(200);
        const modelsPayload = (await modelsResponse.json()) as {
            providerId: string;
            models: Array<{
                id: string;
                supportsReasoning: boolean;
                variants: Array<{ id: string }>;
            }>;
        };
        expect(modelsPayload.providerId).toBe("codex-main");
        expect(modelsPayload.models[0]?.id).toBe("gpt-5.4");
        expect(modelsPayload.models[0]?.supportsReasoning).toBe(true);
        expect(
            modelsPayload.models[0]?.variants.map((item) => item.id),
        ).toEqual(["low", "medium", "high", "xhigh"]);

        const optionsResponse = await fetch(
            new Request("http://localhost/api/agents/example-agent/options"),
        );
        expect(optionsResponse.status).toBe(200);
        const options = (await optionsResponse.json()) as {
            agentId: string;
            defaultProviderId: string;
        };
        expect(options.agentId).toBe("example-agent");
        expect(options.defaultProviderId).toBe("codex-main");
    });

    test("parses disabled auth config", () => {
        const config = parseConfig({
            version: 1,
            auth: {
                mode: "disabled",
            },
            providers: exampleConfig.providers,
            agents: exampleConfig.agents,
        });

        expect(config.auth).toEqual({
            mode: "disabled",
        });
    });
});
