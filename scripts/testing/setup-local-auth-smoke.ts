import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
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

function ensureConvexAuthSecrets() {
    const envPath = repoRootPath(".env.convex.local");
    const env = loadDotEnvIfExists(envPath);
    let changed = false;

    if (!env.SITE_URL?.trim()) {
        env.SITE_URL = "http://localhost:4040";
        changed = true;
    }

    if (!env.JWT_PRIVATE_KEY?.trim() || !env.JWKS?.trim()) {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
            modulusLength: 2048,
        });
        const privateKeyPem = privateKey.export({
            format: "pem",
            type: "pkcs8",
        });
        const publicJwk = publicKey.export({ format: "jwk" });

        env.JWT_PRIVATE_KEY = `${privateKeyPem}`.trimEnd().replace(/\n/g, " ");
        env.JWKS = JSON.stringify({ keys: [{ use: "sig", ...publicJwk }] });
        changed = true;
    }

    if (!env.ENCRYPTION_KEY?.trim()) {
        env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
        changed = true;
    }

    if (env.AGENTCHAT_AUTH_MODE !== "local") {
        env.AGENTCHAT_AUTH_MODE = "local";
        changed = true;
    }

    if (!changed) {
        return;
    }

    const lines = Object.entries(env).map(([key, value]) => `${key}=${value ?? ""}`);
    fs.writeFileSync(envPath, `${lines.join("\n")}\n`, "utf8");
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

    console.log("[agentchat] ensuring local Convex auth secrets");
    ensureConvexAuthSecrets();

    console.log("[agentchat] applying Convex env");
    const convexEnvArgs = ["run", "convex:env"];
    if (deployment) {
        convexEnvArgs.push("--", "--deployment", deployment);
    }
    run("bun", convexEnvArgs);

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
