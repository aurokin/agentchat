import fs from "node:fs";
import {
    isMissingSecret,
    loadDotEnvIfExists,
    mergeEnv,
    parseEnvArg,
    repoRootPath,
    type DotEnv,
} from "./lib";

function validateBase64Key32(value: string): string | null {
    try {
        const raw = value.trim();
        if (!raw) return "is empty";
        const bytes = Buffer.from(raw, "base64");
        if (bytes.length !== 32) {
            return `must decode to 32 bytes (got ${bytes.length})`;
        }
        return null;
    } catch {
        return "is not valid base64";
    }
}

function requireKey(
    env: DotEnv,
    key: string,
    errors: string[],
    opts?: { validate?: (value: string) => string | null },
) {
    const value = env[key]?.trim();
    if (isMissingSecret(value)) {
        errors.push(`${key} is missing/placeholder`);
        return;
    }
    if (opts?.validate) {
        const result = opts.validate(value ?? "");
        if (result) {
            errors.push(`${key} ${result}`);
        }
    }
}

function validateUrlStartsWithHttps(value: string): string | null {
    return value.startsWith("https://") ? null : "must start with https://";
}

function validateConvexCloudUrl(value: string): string | null {
    if (!value.startsWith("https://")) return "must start with https://";
    if (!value.includes(".convex.cloud")) {
        return "should be a Convex client URL (*.convex.cloud)";
    }
    return null;
}

function validateRevenueCatWpl(envName: "dev" | "preview" | "prod", value: string) {
    const hasSandbox = value.includes("/sandbox/");
    if (envName === "preview" && !hasSandbox) {
        return "should be a sandbox Web Purchase Link (expected /sandbox/ in preview)";
    }
    if (envName === "prod" && hasSandbox) {
        return "must not be a sandbox Web Purchase Link (remove /sandbox/ for prod)";
    }
    return null;
}

function isTrueFlag(value: string | undefined): boolean {
    return (value ?? "").trim().toLowerCase() === "true";
}

function loadEnvOrThrow(absPath: string, allowProcessEnv: boolean): DotEnv {
    const exists = fs.existsSync(absPath);
    if (!allowProcessEnv && !exists) {
        throw new Error(`Missing required env file: ${absPath}`);
    }
    const fileEnv = loadDotEnvIfExists(absPath);
    return allowProcessEnv ? mergeEnv(process.env, fileEnv) : fileEnv;
}

const main = (): void => {
    const envName = parseEnvArg(process.argv);
    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const allowDisableCsp = process.argv.includes("--allow-disable-csp");

    const wantsBilling = envName !== "dev";

    const railwayFile = repoRootPath(`.env.railway.${envName}.local`);
    const convexFile = repoRootPath(`.env.convex.${envName}.local`);
    const billingFile = repoRootPath(`.env.billing.${envName}.local`);

    const railwayEnv = loadEnvOrThrow(railwayFile, allowProcessEnv);
    const convexEnv = loadEnvOrThrow(convexFile, allowProcessEnv);
    const billingEnv = wantsBilling
        ? loadEnvOrThrow(billingFile, allowProcessEnv)
        : {};

    const errors: string[] = [];
    const warnings: string[] = [];

    if (envName !== "dev") {
        requireKey(railwayEnv, "NEXT_PUBLIC_CONVEX_URL", errors, {
            validate: validateConvexCloudUrl,
        });
    }

    const disableCsp = isTrueFlag(railwayEnv.DISABLE_CSP);
    if (disableCsp) {
        if (envName === "prod") {
            errors.push(
                "DISABLE_CSP must not be enabled in prod (remove it from Railway vars/env file)",
            );
        } else if (envName === "preview" && !allowDisableCsp) {
            errors.push(
                "DISABLE_CSP is enabled in preview. Remove it (recommended) or re-run with --allow-disable-csp (debug only).",
            );
        } else if (envName === "preview") {
            warnings.push(
                "DISABLE_CSP is enabled in preview (debug only). Remember to remove it so CSP matches production.",
            );
        }
    }

    if (wantsBilling) {
        requireKey(billingEnv, "REVENUECAT_API_KEY", errors);
        requireKey(billingEnv, "REVENUECAT_PROJECT_ID", errors);
        requireKey(billingEnv, "REVENUECAT_WEBHOOK_SECRET", errors);
        requireKey(billingEnv, "REVENUECAT_WEB_PURCHASE_URL", errors, {
            validate: (value) =>
                validateRevenueCatWpl(envName, value) ??
                validateUrlStartsWithHttps(value),
        });
    }

    requireKey(convexEnv, "CONVEX_DEPLOYMENT", errors);
    requireKey(convexEnv, "SITE_URL", errors, {
        validate: validateUrlStartsWithHttps,
    });
    requireKey(convexEnv, "AUTH_GOOGLE_ID", errors);
    requireKey(convexEnv, "AUTH_GOOGLE_SECRET", errors);

    // Required Convex auth/encryption secrets.
    requireKey(convexEnv, "JWKS", errors);
    requireKey(convexEnv, "JWT_PRIVATE_KEY", errors);
    requireKey(convexEnv, "ENCRYPTION_KEY", errors, {
        validate: validateBase64Key32,
    });

    if (errors.length > 0) {
        const header = `Environment validation failed for --env ${envName}`;
        const details = errors.map((err) => `- ${err}`).join("\n");
        throw new Error([header, details].join("\n"));
    }

    if (warnings.length > 0) {
        console.warn(warnings.map((warn) => `warning: ${warn}`).join("\n"));
    }

    console.log(`Environment validation passed for --env ${envName}`);
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
