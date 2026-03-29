import {
    maybeRunInstall,
    persistBootstrapContext,
    prepareBootstrapContext,
} from "./lib/bootstrap.ts";
import { relativeToRepo } from "./lib/util.ts";

async function main(): Promise<void> {
    maybeRunInstall();
    const context = await prepareBootstrapContext();
    persistBootstrapContext(context);

    console.log("Local wrapper bootstrap complete.");
    console.log(`Lane: ${context.manifest.laneId}`);
    console.log(`Web URL: ${context.manifest.webUrl}`);
    console.log(`Server URL: ${context.manifest.serverUrl}`);
    console.log(`Convex mode: ${context.manifest.convexMode}`);
    console.log("Generated files:");
    console.log(
        `- ${relativeToRepo(context.manifest.generatedFiles.webEnvPath)}`,
    );
    console.log(
        `- ${relativeToRepo(context.manifest.generatedFiles.serverEnvPath)}`,
    );
    console.log(
        `- ${relativeToRepo(context.manifest.generatedFiles.serverConfigPath)}`,
    );
    console.log("Next safe commands:");
    console.log("- bun run status");
    console.log("- bun run doctor");
    console.log("- bun run config:print");
    console.log("- bun run dev");
    console.log("- bun run stop");
}

main().catch((error) => {
    console.error(
        error instanceof Error ? error.message : "Local bootstrap failed.",
    );
    process.exitCode = 1;
});
