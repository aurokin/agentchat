export type RuntimeRepeatSmokeArgs = {
    iterations: number;
    serverUrl: string | null;
    keepGoing: boolean;
};

export function parseRuntimeRepeatSmokeArgs(
    argv: string[],
): RuntimeRepeatSmokeArgs {
    let iterations = 3;
    let serverUrl: string | null = null;
    let keepGoing = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--iterations") {
            const value = Number(argv[index + 1]);
            if (!Number.isInteger(value) || value <= 0) {
                throw new Error("--iterations must be a positive integer.");
            }
            iterations = value;
            index += 1;
            continue;
        }

        if (arg === "--server-url") {
            const value = argv[index + 1];
            if (!value) {
                throw new Error("--server-url requires a value.");
            }
            serverUrl = value;
            index += 1;
            continue;
        }

        if (arg === "--keep-going") {
            keepGoing = true;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return {
        iterations,
        serverUrl,
        keepGoing,
    };
}
