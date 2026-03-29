import { buildDoctorReport, prepareBootstrapContext } from "./lib/bootstrap.ts";
import { loadHostConfig } from "./lib/hostConfig.ts";
import { loadLocalManifest } from "./lib/manifest.ts";
import { startManagedServices } from "./lib/processes.ts";
import { isStableCheckout, relativeToRepo } from "./lib/util.ts";

async function main(): Promise<void> {
    const hostConfig = loadHostConfig();
    const manifest = loadLocalManifest();

    if (!manifest) {
        throw new Error("Missing local manifest. Run bun run bootstrap first.");
    }

    if (
        isStableCheckout(manifest.checkoutPath, hostConfig.stableCheckoutPath)
    ) {
        throw new Error(
            "This checkout is reserved for the stable installation. Use scripts/host/install-stable.sh or the documented stable host install procedure.",
        );
    }

    const doctorReport = buildDoctorReport(
        await prepareBootstrapContext(),
        null,
    );
    const failingChecks = doctorReport.checks.filter((check) => !check.ok);
    if (failingChecks.length > 0) {
        throw new Error(
            [
                "Refusing to start wrapper-managed dev services until bun run doctor passes.",
                ...failingChecks.map(
                    (check) => `- ${check.label}: ${check.detail}`,
                ),
            ].join("\n"),
        );
    }

    const services = await startManagedServices(manifest);
    console.log("Wrapper-managed dev services started.");
    console.log(`Lane: ${manifest.laneId}`);
    console.log(`Web URL: ${manifest.webUrl}`);
    console.log(`Server URL: ${manifest.serverUrl}`);
    console.log("Logs:");
    for (const service of services) {
        console.log(
            `- ${service.service}: ${relativeToRepo(service.logPath)} (pid ${service.pid})`,
        );
    }
    console.log("Next safe commands:");
    console.log("- bun run status");
    console.log("- bun run stop");
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Wrapper dev failed.",
    );
    process.exitCode = 1;
});
