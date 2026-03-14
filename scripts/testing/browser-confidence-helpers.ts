import { trimTrailingSlash } from "./lib";

export type BrowserConfidenceMode =
    | "smoke"
    | "interrupt"
    | "refresh"
    | "full";

const DEFAULT_BASE_URL = "http://127.0.0.1:4040";

export function parseBrowserConfidenceArgs(argv: string[]): {
    baseUrl: string;
    mode: BrowserConfidenceMode;
} {
    let baseUrl = DEFAULT_BASE_URL;
    let mode: BrowserConfidenceMode = "full";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--base-url") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--base-url requires a value.");
            }
            baseUrl = trimTrailingSlash(value);
            index += 1;
            continue;
        }

        if (arg === "--mode") {
            const value = argv[index + 1];
            if (
                value !== "smoke" &&
                value !== "interrupt" &&
                value !== "refresh" &&
                value !== "full"
            ) {
                throw new Error(
                    "--mode must be smoke, interrupt, refresh, or full.",
                );
            }
            mode = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return { baseUrl, mode };
}
