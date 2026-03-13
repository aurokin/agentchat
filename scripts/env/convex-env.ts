import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
    isMissingSecret,
    loadDotEnvIfExists,
    mergeEnv,
    readArgValue,
    repoRootPath,
} from "./lib";

const toConvexDeploymentId = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("Convex target is empty");
    }

    // If caller provided a fully-qualified value, keep it.
    // Example: dev:blessed-cuttlefish-350
    if (trimmed.includes(":")) {
        return trimmed;
    }

    return `dev:${trimmed}`;
};

const runConvexEnvSet = (args: {
    convexDeployment: string;
    name: string;
    value: string;
}): void => {
    // Use stdin so secrets don't end up in shell history or process args.
    const targetDeployment = args.convexDeployment;
    const cliArgs: string[] = ["convex", "env", "set"];
    if (targetDeployment.startsWith("prod:")) {
        cliArgs.push("--prod");
    } else if (targetDeployment.startsWith("dev:")) {
        cliArgs.push(
            "--deployment-name",
            targetDeployment.replace(/^dev:/, ""),
        );
    } else {
        cliArgs.push("--deployment-name", targetDeployment);
    }
    cliArgs.push(args.name);

    const result = spawnSync("bunx", cliArgs, {
        cwd: repoRootPath("packages", "convex"),
        input: args.value,
        stdio: ["pipe", "inherit", "inherit"],
        env: {
            ...process.env,
            // Convex CLI initializes Sentry when CI is unset. In environments with restricted DNS,
            // this can cause the CLI to crash-report and fail. Treat this as a scripted/CI-style run.
            CI: "1",
        },
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(
            `Failed to set Convex env var ${args.name} (exit ${result.status ?? "unknown"})`,
        );
    }
};

const main = (): void => {
    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const absSecretsFile = repoRootPath(".env.convex.local");
    const secretsFileEnv = loadDotEnvIfExists(absSecretsFile);

    if (!allowProcessEnv && !fs.existsSync(absSecretsFile)) {
        throw new Error(
            `Missing ${absSecretsFile}. Create it and re-run (see docs/local_environment_setup_checklist.md).`,
        );
    }

    const env = allowProcessEnv ? mergeEnv(process.env, secretsFileEnv) : secretsFileEnv;

    if (!env.SITE_URL?.trim()) {
        env.SITE_URL = "http://localhost:4040";
    }

    const deploymentArg = readArgValue(process.argv, "--deployment");
    const deploymentNameArg = readArgValue(process.argv, "--deployment-name");
    const deploymentFromEnv = env.CONVEX_DEPLOYMENT?.trim();
    const deploymentInput =
        deploymentArg ?? deploymentNameArg ?? deploymentFromEnv;

    if (!deploymentInput) {
        throw new Error(
            [
                "Missing Convex target.",
                "Pass --deployment <CONVEX_DEPLOYMENT> (recommended) or set CONVEX_DEPLOYMENT=... in .env.convex.local.",
                "Example: bun run convex:env -- --deployment dev:blessed-cuttlefish-350",
            ].join("\n"),
        );
    }

    const convexDeployment = toConvexDeploymentId(deploymentInput);

    const hasGoogleId = Boolean(env.AUTH_GOOGLE_ID?.trim());
    const hasGoogleSecret = Boolean(env.AUTH_GOOGLE_SECRET?.trim());
    if (hasGoogleId !== hasGoogleSecret) {
        throw new Error(
            "AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must both be set (or both omitted) in .env.convex.local.",
        );
    }

    const reservedKeys = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL"]);
    const entriesToSet = Object.entries(env)
        .filter(([k]) => !reservedKeys.has(k))
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, (v ?? "").trim()] as const)
        .filter(([, v]) => v.length > 0);

    if (entriesToSet.length === 0) {
        throw new Error(
            `No env vars found in ${absSecretsFile}. Add at least one KEY=VALUE line and re-run.`,
        );
    }

    // Guard against accidentally setting placeholder values like "<set me>".
    for (const [name, value] of entriesToSet) {
        if (isMissingSecret(value)) {
            throw new Error(
                `Refusing to set ${name}: value looks missing/placeholder. Fix ${absSecretsFile} and re-run.`,
            );
        }
    }

    console.log(
        `Setting Convex env vars from ${absSecretsFile} on "${convexDeployment}"...`,
    );

    for (const [name, value] of entriesToSet) {
        runConvexEnvSet({
            convexDeployment,
            name,
            value,
        });
    }

    console.log("Done.");
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
