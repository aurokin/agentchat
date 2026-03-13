import fs from "node:fs";
import {
    isMissingSecret,
    loadDotEnvIfExists,
    mergeEnv,
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

function loadEnvOrThrow(absPath: string, allowProcessEnv: boolean): DotEnv {
    const exists = fs.existsSync(absPath);
    if (!allowProcessEnv && !exists) {
        throw new Error(`Missing required env file: ${absPath}`);
    }
    const fileEnv = loadDotEnvIfExists(absPath);
    return allowProcessEnv ? mergeEnv(process.env, fileEnv) : fileEnv;
}

const main = (): void => {
    const allowProcessEnv = process.argv.includes("--allow-process-env");
    const convexFile = repoRootPath(".env.convex.local");
    const convexEnv = loadEnvOrThrow(convexFile, allowProcessEnv);

    const errors: string[] = [];
    const warnings: string[] = [];

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
        const header = "Local Convex environment validation failed";
        const details = errors.map((err) => `- ${err}`).join("\n");
        throw new Error([header, details].join("\n"));
    }

    if (warnings.length > 0) {
        console.warn(warnings.map((warn) => `warning: ${warn}`).join("\n"));
    }

    console.log("Local Convex environment validation passed");
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
