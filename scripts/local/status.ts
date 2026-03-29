import fs from "node:fs";
import path from "node:path";

import { loadHostConfig } from "./lib/hostConfig.ts";
import { buildConfigPrintPayload, loadLocalManifest } from "./lib/manifest.ts";
import { summarizeCurrentCheckoutServices } from "./lib/processes.ts";
import { loadHostRegistry, loadPortLeases } from "./lib/registry.ts";
import { relativeToRepo } from "./lib/util.ts";

async function main(): Promise<void> {
    const manifest = loadLocalManifest();
    const hostConfig = loadHostConfig();
    const registry = loadHostRegistry(hostConfig);

    if (!manifest) {
        console.log("No local wrapper manifest found.");
        console.log(
            "Run bun run bootstrap to materialize checkout-local config.",
        );
        return;
    }

    const payload = buildConfigPrintPayload({
        manifest,
        registry,
        hostConfig,
        checkoutPath: process.cwd(),
    });
    const resolvedCheckoutPath = path.resolve(manifest.checkoutPath);
    const leases = loadPortLeases().leases.filter(
        (lease) =>
            lease.laneId === manifest.laneId &&
            path.resolve(lease.checkoutPath) === resolvedCheckoutPath,
    );
    const services = summarizeCurrentCheckoutServices(manifest);
    const generatedFiles = [
        manifest.generatedFiles.webEnvPath,
        manifest.generatedFiles.serverEnvPath,
        manifest.generatedFiles.serverConfigPath,
    ];

    console.log(`Lane: ${manifest.laneId}`);
    console.log(`Type: ${manifest.laneType}`);
    console.log(`Checkout: ${manifest.checkoutPath}`);
    console.log(`Web URL: ${manifest.webUrl}`);
    console.log(`Server URL: ${manifest.serverUrl}`);
    console.log(`State ID: ${manifest.stateId}`);
    console.log(`Sandbox Root: ${manifest.sandboxRoot}`);
    console.log(`XDG_STATE_HOME: ${manifest.xdgStateHome}`);
    console.log(`Convex mode: ${manifest.convexMode}`);
    console.log(`Host config: ${payload.hostConfig.path}`);
    console.log(`Stable checkout: ${payload.hostRegistry.stableCheckoutPath}`);
    console.log(
        `Stable LAN URL: ${payload.hostConfig.values.stable.lanUrl ?? "unset"}`,
    );
    console.log(
        `Stable public URL: ${payload.hostConfig.values.stable.publicUrl ?? "unset"}`,
    );
    console.log(
        `Stable secondary URLs: ${
            payload.hostConfig.values.stable.secondaryUrls.length > 0
                ? payload.hostConfig.values.stable.secondaryUrls.join(", ")
                : "none"
        }`,
    );
    console.log(
        `Shared dev Convex env: ${payload.hostConfig.values.dev.convexEnvPath}`,
    );
    console.log("Generated files:");
    for (const absPath of generatedFiles) {
        console.log(
            `- ${relativeToRepo(absPath)} ${fs.existsSync(absPath) ? "(present)" : "(missing)"}`,
        );
    }
    console.log(
        `Leases: ${leases.length > 0 ? leases.map((lease) => `${lease.service}=${lease.port}`).join(", ") : "none"}`,
    );
    console.log("Managed services:");
    if (services.length === 0) {
        console.log("- none");
    } else {
        for (const service of services) {
            console.log(
                `- ${service.service}: pid=${service.pid} ports=${service.ports.join(",")} log=${relativeToRepo(service.logPath)}`,
            );
        }
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Status failed.");
    process.exitCode = 1;
});
