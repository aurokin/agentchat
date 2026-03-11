import { ConfigStore } from "./config.ts";
import { createFetchHandler } from "./http.ts";

const configStore = new ConfigStore();
configStore.watch();

const server = Bun.serve({
    hostname: "0.0.0.0",
    port: 3030,
    fetch: createFetchHandler({
        getConfig: () => configStore.snapshot,
    }),
});

console.log(
    `[agentchat-server] listening on http://${server.hostname}:${server.port}`,
);
console.log(`[agentchat-server] using config ${configStore.path}`);
