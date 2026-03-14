import readline from "node:readline/promises";

import {
    createLocalUser,
    getRepoRoot,
} from "./local-auth-users";
import {
    parseCreateLocalUserArgs,
    resolveDisplayName,
} from "./create-local-user-helpers";

async function promptLine(rl: readline.Interface, label: string) {
    return (await rl.question(label)).trim();
}

async function promptHidden(label: string): Promise<string> {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
        throw new Error(
            "Interactive password entry requires a TTY. Pass --password instead.",
        );
    }

    stdout.write(label);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";

    return await new Promise<string>((resolve, reject) => {
        const cleanup = () => {
            stdin.setRawMode?.(false);
            stdin.pause();
            stdin.off("data", onData);
        };

        const onData = (chunk: string) => {
            const char = chunk.toString();

            if (char === "\u0003") {
                cleanup();
                stdout.write("^C\n");
                reject(new Error("Cancelled."));
                return;
            }

            if (char === "\r" || char === "\n") {
                cleanup();
                stdout.write("\n");
                resolve(value);
                return;
            }

            if (char === "\u007f") {
                if (value.length > 0) {
                    value = value.slice(0, -1);
                }
                return;
            }

            value += char;
        };

        stdin.on("data", onData);
    });
}

async function main() {
    const args = parseCreateLocalUserArgs(process.argv.slice(2));
    const repoRoot = getRepoRoot();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const username =
            args.username || (await promptLine(rl, "Username: "));
        if (!username) {
            throw new Error("Username is required.");
        }

        const defaultDisplayName = resolveDisplayName(username, args.displayName);
        const displayName =
            args.displayName ??
            ((await promptLine(
                rl,
                `Display name [${defaultDisplayName}]: `,
            )) ||
                defaultDisplayName);

        const password = args.password ?? (await promptHidden("Password: "));
        if (!password) {
            throw new Error("Password is required.");
        }

        if (!args.password) {
            const confirmation = await promptHidden("Confirm password: ");
            if (confirmation !== password) {
                throw new Error("Passwords did not match.");
            }
        }

        const user = createLocalUser({
            repoRoot,
            user: {
                username,
                displayName: resolveDisplayName(username, displayName),
                password,
            },
            calledBy: "create-local-user",
        });

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    username,
                    displayName: user.name ?? resolveDisplayName(username, displayName),
                    userId: user._id,
                    email: user.email ?? `${username}@local.agentchat`,
                },
                null,
                2,
            ),
        );
    } finally {
        rl.close();
    }
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
