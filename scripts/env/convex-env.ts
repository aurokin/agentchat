import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
    isMissingSecret,
    loadDotEnvIfExists,
    mergeEnv,
    parseEnvArg,
    readArgValue,
    repoRootPath,
} from "./lib";

const inferDeploymentNameFromUrl = (
    urlValue: string | undefined,
): string | undefined => {
    if (!urlValue) return undefined;
    try {
        const url = new URL(urlValue);
        const host = url.hostname;
        for (const suffix of [".convex.site", ".convex.cloud"]) {
            if (!host.endsWith(suffix)) continue;
            const prefix = host.slice(0, -suffix.length);
            if (!prefix || prefix.includes(".")) return undefined;
            return prefix;
        }
        return undefined;
    } catch {
        return undefined;
    }
};

const inferDeploymentNameFromBillingEnv = (
    envName: "preview" | "prod",
): string | undefined => {
    try {
        const abs = repoRootPath("billing", `env.${envName}.json`);
        if (!fs.existsSync(abs)) return undefined;
        const text = fs.readFileSync(abs, "utf8");
        const parsed = JSON.parse(text) as {
            webhook?: { url?: unknown };
        };
        const webhookUrl =
            typeof parsed.webhook?.url === "string" ? parsed.webhook.url : undefined;
        return inferDeploymentNameFromUrl(webhookUrl?.trim());
    } catch {
        return undefined;
    }
};

const inferSiteUrlFromBillingEnv = (envName: "preview" | "prod"): string | undefined => {
    try {
        const abs = repoRootPath("billing", `env.${envName}.json`);
        if (!fs.existsSync(abs)) return undefined;
        const text = fs.readFileSync(abs, "utf8");
        const parsed = JSON.parse(text) as {
            app?: { base_url?: unknown };
        };
        const baseUrl =
            typeof parsed.app?.base_url === "string" ? parsed.app.base_url : undefined;
        if (!baseUrl) return undefined;
        const trimmed = baseUrl.trim();
        if (!trimmed) return undefined;
        if (trimmed.includes("<")) return undefined;
        return trimmed.replace(/\/$/, "");
    } catch {
        return undefined;
    }
};

const toConvexDeploymentId = (
    envName: "preview" | "prod",
    value: string,
): string => {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("Convex deployment is empty");
    }

    // If caller provided a fully-qualified value, keep it.
    // Example: dev:blessed-cuttlefish-350
    if (trimmed.includes(":")) {
        return trimmed;
    }

    // For preview we default to a dev deployment.
    if (envName === "preview") {
        return `dev:${trimmed}`;
    }

    // For prod, require the caller to be explicit because Convex prefixes vary.
    throw new Error(
        `For --env prod, pass a full CONVEX_DEPLOYMENT value (example: dev:${trimmed} or prod:${trimmed}) via --deployment`,
    );
};

const runConvexEnvSet = (args: {
    convexDeployment: string;
    name: string;
    value: string;
}): void => {
    // Use stdin so secrets don't end up in shell history or process args.
    const result = spawnSync("bunx", ["convex", "env", "set", args.name], {
        cwd: repoRootPath("packages", "convex"),
        input: args.value,
        stdio: ["pipe", "inherit", "inherit"],
        env: {
            ...process.env,
            // Convex CLI initializes Sentry when CI is unset. In environments with restricted DNS,
            // this can cause the CLI to crash-report and fail. Treat this as a scripted/CI-style run.
            CI: "1",
            CONVEX_DEPLOYMENT: args.convexDeployment,
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
    const envName = parseEnvArg(process.argv);

    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const absSecretsFile = repoRootPath(`.env.convex.${envName}.local`);
    const secretsFileEnv = loadDotEnvIfExists(absSecretsFile);

    if (!allowProcessEnv && !fs.existsSync(absSecretsFile)) {
        throw new Error(
            `Missing ${absSecretsFile}. Create it and re-run (see docs/cloud_dashboard_setup.md).`,
        );
    }

    const env = allowProcessEnv ? mergeEnv(process.env, secretsFileEnv) : secretsFileEnv;

    // Optional: default SITE_URL from billing/env.<env>.json if caller didn't provide it.
    if (!env.SITE_URL?.trim()) {
        const inferred = inferSiteUrlFromBillingEnv(envName);
        if (inferred) {
            env.SITE_URL = inferred;
        }
    }

    const deploymentArg = readArgValue(process.argv, "--deployment");
    const deploymentNameArg = readArgValue(process.argv, "--deployment-name");
    const deploymentFromEnv = env.CONVEX_DEPLOYMENT?.trim();
    const inferredDeploymentName = inferDeploymentNameFromBillingEnv(envName);
    const deploymentInput =
        deploymentArg ??
        deploymentNameArg ??
        deploymentFromEnv ??
        inferredDeploymentName;

    if (!deploymentInput) {
        throw new Error(
            [
                "Missing Convex deployment.",
                "Pass --deployment <CONVEX_DEPLOYMENT> (recommended), set CONVEX_DEPLOYMENT=... in .env.convex.<env>.local, or ensure billing/env.<env>.json webhook.url is a https://<deployment>.convex.site/... URL so it can be inferred.",
                `Example: bun run convex:env -- --env ${envName} --deployment dev:blessed-cuttlefish-350`,
            ].join("\n"),
        );
    }

    const convexDeployment = toConvexDeploymentId(envName, deploymentInput);

    const hasGoogleId = Boolean(env.AUTH_GOOGLE_ID?.trim());
    const hasGoogleSecret = Boolean(env.AUTH_GOOGLE_SECRET?.trim());
    if (hasGoogleId !== hasGoogleSecret) {
        throw new Error(
            `AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET must both be set (or both omitted) in .env.convex.${envName}.local.`,
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
        `Setting Convex env vars from ${absSecretsFile} on "${convexDeployment}" (${envName})...`,
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

