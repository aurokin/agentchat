import { execFileSync, spawnSync } from "node:child_process";
import { loadDotEnvIfExists, readArgValue, repoRootPath } from "../env/lib";

function resolveDeploymentArg(argv: string[]): string | null {
    return (
        readArgValue(argv, "--deployment") ??
        readArgValue(argv, "--deployment-name") ??
        loadDotEnvIfExists(repoRootPath(".env.convex.local")).CONVEX_DEPLOYMENT ??
        null
    );
}

function run(command: string, args: string[]) {
    execFileSync(command, args, {
        cwd: repoRootPath(),
        stdio: "inherit",
    });
}

function setConvexEnv(name: string, value: string, deployment: string | null) {
    const args = ["convex", "env", "set"];
    if (deployment) {
        if (deployment.startsWith("prod:")) {
            args.push("--prod");
        } else if (deployment.startsWith("dev:")) {
            args.push("--deployment-name", deployment.replace(/^dev:/, ""));
        } else {
            args.push("--deployment-name", deployment);
        }
    }
    args.push(name, value);

    const result = spawnSync("bunx", args, {
        cwd: repoRootPath("packages", "convex"),
        stdio: "inherit",
    });
    if (result.status !== 0) {
        throw new Error(`Failed to set Convex env var ${name}.`);
    }
}

function main() {
    const argv = process.argv.slice(2);
    const deployment = resolveDeploymentArg(argv);

    console.log("[agentchat] writing local auth server config");
    run("bun", [
        "scripts/testing/write-test-agent-config.ts",
        "--auth-mode=local",
        "--force",
    ]);

    console.log("[agentchat] setting Convex auth mode to local");
    setConvexEnv("AGENTCHAT_AUTH_MODE", "local", deployment);

    console.log("[agentchat] seeding smoke_1 and smoke_2");
    run("bun", ["scripts/testing/seed-local-users.ts"]);

    console.log("[agentchat] local auth smoke setup complete");
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
