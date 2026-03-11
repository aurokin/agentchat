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
    });

    test("serves bootstrap and agent options routes", async () => {
        const fetch = createFetchHandler({
            getConfig: () => exampleConfig,
        });

        const bootstrapResponse = await fetch(
            new Request("http://localhost/api/bootstrap"),
        );
        expect(bootstrapResponse.status).toBe(200);
        const bootstrap = (await bootstrapResponse.json()) as {
            agents: Array<{ id: string }>;
            providers: Array<{ id: string }>;
        };
        expect(bootstrap.agents[0]?.id).toBe("example-agent");
        expect(bootstrap.providers[0]?.id).toBe("codex-main");

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
});
