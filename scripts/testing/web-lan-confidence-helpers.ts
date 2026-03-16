import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { trimTrailingSlash } from "./lib";

export type WebLanConfidenceArgs = {
    configPath: string;
    json: boolean;
};

export type WebLanConfidenceConfig = {
    baseUrl: string;
};

const DEFAULT_CONFIG_PATH = "scripts/testing/web-lan-confidence.local.json";

export function parseWebLanConfidenceArgs(
    argv: string[],
): WebLanConfidenceArgs {
    let configPath = DEFAULT_CONFIG_PATH;
    let json = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--json") {
            json = true;
            continue;
        }

        if (arg === "--config") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--config requires a value.");
            }
            configPath = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return {
        configPath,
        json,
    };
}

export function loadWebLanConfidenceConfig(params: {
    repoRoot: string;
    configPath: string;
}): WebLanConfidenceConfig {
    const absoluteConfigPath = path.isAbsolute(params.configPath)
        ? params.configPath
        : path.join(params.repoRoot, params.configPath);

    if (!existsSync(absoluteConfigPath)) {
        throw new Error(
            `Missing LAN browser confidence config at ${path.relative(
                params.repoRoot,
                absoluteConfigPath,
            )}. Copy scripts/testing/web-lan-confidence.local.example.json and adjust it for your LAN host.`,
        );
    }

    const parsed = JSON.parse(
        readFileSync(absoluteConfigPath, "utf8"),
    ) as Partial<WebLanConfidenceConfig>;
    const baseUrl = parsed.baseUrl?.trim();
    if (!baseUrl) {
        throw new Error(
            `LAN browser confidence config ${path.relative(
                params.repoRoot,
                absoluteConfigPath,
            )} must define a non-empty "baseUrl".`,
        );
    }

    return {
        baseUrl: trimTrailingSlash(baseUrl),
    };
}
