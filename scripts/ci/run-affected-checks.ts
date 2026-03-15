import { spawnSync } from "node:child_process";

import {
    buildAffectedCommands,
    detectAffectedTargets,
    parseAffectedArgs,
} from "./affected-checks-helpers";

function runGitDiff(baseRef: string | null): string[] {
    const diffArgs = baseRef
        ? ["diff", "--name-only", "--relative", `${baseRef}...HEAD`]
        : ["diff", "--name-only", "--relative", "HEAD"];

    const result = spawnSync("git", diffArgs, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
        const stderr = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        throw new Error(`Failed to read changed files from git: ${stderr}`);
    }

    return (result.stdout ?? "")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function runCommand(cmd: string): void {
    const result = spawnSync("zsh", ["-lc", cmd], {
        stdio: "inherit",
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function main(): void {
    const { baseRef, files } = parseAffectedArgs(process.argv.slice(2));
    const changedFiles = files.length > 0 ? files : runGitDiff(baseRef);

    if (changedFiles.length === 0) {
        console.log("[affected-checks] No changed files detected.");
        return;
    }

    const targets = detectAffectedTargets(changedFiles);
    const commands = buildAffectedCommands(targets);

    if (commands.length === 0) {
        console.log(
            "[affected-checks] No runnable app/package surfaces were affected.",
        );
        return;
    }

    console.log("[affected-checks] Changed files:");
    for (const file of changedFiles) {
        console.log(`- ${file}`);
    }

    console.log("[affected-checks] Running:");
    for (const command of commands) {
        console.log(`- ${command.label}: ${command.cmd}`);
        runCommand(command.cmd);
    }
}

main();
