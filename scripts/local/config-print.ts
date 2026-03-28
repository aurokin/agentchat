import { loadHostConfig } from "./lib/hostConfig.ts";
import { buildConfigPrintPayload, loadLocalManifest } from "./lib/manifest.ts";
import { summarizeCurrentCheckoutServices } from "./lib/processes.ts";
import { loadHostRegistry, loadPortLeases } from "./lib/registry.ts";

const hostConfig = loadHostConfig();
const registry = loadHostRegistry(hostConfig);
const manifest = loadLocalManifest();
const payload = buildConfigPrintPayload({
    manifest,
    registry,
    hostConfig,
    checkoutPath: process.cwd(),
});

console.log(
    JSON.stringify(
        {
            ...payload,
            portLeases: loadPortLeases().leases,
            managedServices: manifest
                ? summarizeCurrentCheckoutServices(manifest)
                : [],
        },
        null,
        4,
    ),
);
