import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    loadWebLanConfidenceConfig,
    parseWebLanConfidenceArgs,
} from "./web-lan-confidence-helpers";

function getRepoRoot(): string {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(scriptDir, "..", "..");
}

const repoRoot = getRepoRoot();
const args = parseWebLanConfidenceArgs(process.argv.slice(2));
const config = loadWebLanConfidenceConfig({
    repoRoot,
    configPath: args.configPath,
});

const command = [
    "scripts/testing/browser-confidence.ts",
    "--mode",
    "full",
    "--base-url",
    config.baseUrl,
];

if (args.json) {
    command.push("--json");
}

const result = spawnSync("bun", command, {
    cwd: repoRoot,
    stdio: "inherit",
});

if (result.error) {
    throw result.error;
}

process.exit(result.status ?? 1);
