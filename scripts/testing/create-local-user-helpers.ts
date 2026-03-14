import { formatDisplayNameFromUsername } from "./local-auth-users";

export type CreateLocalUserArgs = {
    username: string | null;
    displayName: string | null;
    password: string | null;
};

export function parseCreateLocalUserArgs(argv: string[]): CreateLocalUserArgs {
    let username: string | null = null;
    let displayName: string | null = null;
    let password: string | null = null;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = argv[index + 1];

        if (arg === "--username") {
            if (!value) {
                throw new Error("--username requires a value.");
            }
            username = value.trim();
            index += 1;
            continue;
        }

        if (arg === "--display-name") {
            if (!value) {
                throw new Error("--display-name requires a value.");
            }
            displayName = value.trim();
            index += 1;
            continue;
        }

        if (arg === "--password") {
            if (!value) {
                throw new Error("--password requires a value.");
            }
            password = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return {
        username,
        displayName,
        password,
    };
}

export function resolveDisplayName(
    username: string,
    explicitDisplayName?: string | null,
): string {
    const trimmed = explicitDisplayName?.trim();
    if (trimmed) {
        return trimmed;
    }

    return formatDisplayNameFromUsername(username);
}
