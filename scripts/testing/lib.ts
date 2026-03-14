import { existsSync, readFileSync } from "node:fs";

export function trimTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

export function tryReadEnvValue(filePath: string, key: string): string | null {
    if (!existsSync(filePath)) {
        return null;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/u);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separator = trimmed.indexOf("=");
        if (separator === -1) {
            continue;
        }

        const envKey = trimmed.slice(0, separator).trim();
        if (envKey !== key) {
            continue;
        }

        return trimmed.slice(separator + 1).trim() || null;
    }

    return null;
}

export function parseConvexRunOutput(stdout: string): unknown {
    const lines = stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !line.startsWith("✔ "))
        .filter((line) => !line.startsWith("- "))
        .filter((line) => !line.startsWith("Preparing Convex functions"));

    if (lines.length === 0) {
        return null;
    }

    return JSON.parse(lines.join("\n")) as unknown;
}
