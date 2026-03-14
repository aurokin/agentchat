import {
    ensureLocalUser,
    getRepoRoot,
} from "./local-auth-users";

type SeedUser = {
    username: string;
    displayName: string;
    password: string;
};

const DEFAULT_USERS: SeedUser[] = [
    {
        username: "smoke_1",
        displayName: "Smoke 1",
        password: "smoke_1_password",
    },
    {
        username: "smoke_2",
        displayName: "Smoke 2",
        password: "smoke_2_password",
    },
];

function parseUsersFromArgs(argv: string[]): SeedUser[] {
    const users = [...DEFAULT_USERS];

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg !== "--user") {
            throw new Error(`Unsupported argument: ${arg}`);
        }

        const value = argv[index + 1];
        if (!value) {
            throw new Error("--user requires username:displayName:password");
        }

        const [username, displayName, password] = value.split(":");
        if (!username || !displayName || !password) {
            throw new Error("--user requires username:displayName:password");
        }
        users.push({ username, displayName, password });
        index += 1;
    }

    return users;
}

async function main() {
    const repoRoot = getRepoRoot();
    const users = parseUsersFromArgs(process.argv.slice(2));

    for (const user of users) {
        const result = ensureLocalUser({
            repoRoot,
            user,
            calledBy: "seed-local-users",
        });
        console.log(
            `[agentchat] ${result.status === "created" ? "created" : "local user"} ${user.username}${result.status === "existing" ? " already exists" : ""}`,
        );
    }

    console.log("[agentchat] local smoke users ready");
}

await main();
