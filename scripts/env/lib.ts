import fs from "node:fs";
import path from "node:path";

export type AppEnvName = "dev" | "preview" | "prod";

export type DotEnv = Record<string, string | undefined>;

export const parseEnvArg = (argv: string[]): AppEnvName => {
    const idx = argv.indexOf("--env");
    if (idx === -1 || !argv[idx + 1]) {
        throw new Error("Missing required arg: --env dev|preview|prod");
    }
    const value = argv[idx + 1];
    if (value !== "dev" && value !== "preview" && value !== "prod") {
        throw new Error(
            `Invalid --env: ${value} (expected dev|preview|prod)`,
        );
    }
    return value;
};

export const repoRootPath = (...parts: string[]): string =>
    path.join(process.cwd(), ...parts);

// Minimal dotenv parser (KEY=VALUE) with optional single/double quotes.
export const parseDotEnvFile = (text: string): DotEnv => {
    const out: DotEnv = {};
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("#")) continue;

        const eq = line.indexOf("=");
        if (eq === -1) continue;

        let key = line.slice(0, eq).trim();
        if (key.startsWith("export ")) {
            key = key.slice("export ".length).trim();
        }
        if (!key) continue;

        let value = line.slice(eq + 1).trim();

        if (
            (value.startsWith("\"") && value.endsWith("\"")) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        out[key] = value;
    }
    return out;
};

export const loadDotEnvIfExists = (absPath: string): DotEnv => {
    if (!fs.existsSync(absPath)) {
        return {};
    }
    return parseDotEnvFile(fs.readFileSync(absPath, "utf8"));
};

export const mergeEnv = (...layers: DotEnv[]): DotEnv => {
    const out: DotEnv = {};
    for (const layer of layers) {
        for (const [k, v] of Object.entries(layer)) {
            if (v !== undefined) out[k] = v;
        }
    }
    return out;
};

export const readArgValue = (
    argv: string[],
    name: string,
): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    const value = argv[idx + 1];
    if (!value || value.startsWith("--")) return undefined;
    return value;
};

export const isMissingSecret = (value: string | undefined): boolean => {
    if (!value) return true;
    const trimmed = value.trim();
    if (!trimmed) return true;
    return trimmed.startsWith("<") || trimmed.includes("<");
};
