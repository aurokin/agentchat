import fs from "node:fs";
import path from "node:path";
import { isMissingSecret, loadDotEnvIfExists, repoRootPath } from "./lib";

// Migrate pre-AUR-184 checkouts where apps/server/.env.local was minted
// independently of .env.convex.local. Reads the local server env, copies the
// two shared secrets into .env.convex.local without rotating, and stops if
// neither side has a usable value.
const SHARED_KEYS = ["RUNTIME_INGRESS_SECRET", "BACKEND_TOKEN_SECRET"] as const;

const main = (): void => {
    const convexFile = repoRootPath(".env.convex.local");
    const serverFile = repoRootPath("apps", "server", ".env.local");

    if (!fs.existsSync(convexFile)) {
        throw new Error(
            [
                `Missing ${convexFile}.`,
                "Copy .env.convex.local.example and fill it in before running env:sync-secrets.",
            ].join("\n"),
        );
    }

    const convexEnv = loadDotEnvIfExists(convexFile);
    const serverEnv = loadDotEnvIfExists(serverFile);

    const toAppend: { key: string; value: string }[] = [];
    const skipped: string[] = [];
    const missing: string[] = [];

    for (const key of SHARED_KEYS) {
        if (!isMissingSecret(convexEnv[key])) {
            skipped.push(key);
            continue;
        }
        const fromServer = serverEnv[key]?.trim();
        if (isMissingSecret(fromServer)) {
            missing.push(key);
            continue;
        }
        toAppend.push({ key, value: fromServer! });
    }

    if (missing.length > 0) {
        throw new Error(
            [
                `No usable value for: ${missing.join(", ")}.`,
                "Neither .env.convex.local nor apps/server/.env.local has these set.",
                "Mint fresh secrets and push them to Convex:",
                "  bun run convex:gen-secrets >> .env.convex.local",
                "  bun run convex:env",
            ].join("\n"),
        );
    }

    if (toAppend.length === 0) {
        console.log(
            `env:sync-secrets: nothing to do (already present in .env.convex.local: ${skipped.join(", ")}).`,
        );
        return;
    }

    const existing = fs.readFileSync(convexFile, "utf8");
    const needsLeadingNewline = existing.length > 0 && !existing.endsWith("\n");
    const block = [
        "",
        "# Added by env:sync-secrets — shared with apps/server. Do not rotate without coordinating Convex.",
        ...toAppend.map(({ key, value }) => `${key}=${value}`),
        "",
    ].join("\n");
    fs.appendFileSync(convexFile, (needsLeadingNewline ? "\n" : "") + block);

    console.log(
        `env:sync-secrets: appended ${toAppend.map((e) => e.key).join(", ")} to ${path.relative(process.cwd(), convexFile)}.`,
    );
    if (skipped.length > 0) {
        console.log(
            `  already present, left untouched: ${skipped.join(", ")}.`,
        );
    }
    console.log("Next: run `bun run convex:env` to push to Convex.");
};

try {
    main();
} catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
}
