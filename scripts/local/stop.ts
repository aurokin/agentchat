import { loadLocalManifest } from "./lib/manifest.ts";
import { stopManagedServices } from "./lib/processes.ts";
import { relativeToRepo } from "./lib/util.ts";

async function main(): Promise<void> {
    const manifest = loadLocalManifest();
    if (!manifest) {
        throw new Error("Missing local manifest. Run bun run bootstrap first.");
    }

    const services = await stopManagedServices(manifest);
    if (services.length === 0) {
        console.log(
            "No wrapper-managed dev services are registered for this checkout.",
        );
        return;
    }

    console.log("Wrapper-managed dev services stopped.");
    for (const service of services) {
        console.log(
            `- ${service.service}: pid ${service.pid}, log ${relativeToRepo(service.logPath)}`,
        );
    }
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Wrapper stop failed.",
    );
    process.exitCode = 1;
});
