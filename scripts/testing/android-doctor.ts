import { spawnSync } from "node:child_process";
import path from "node:path";

import { loadDotEnvIfExists, repoRootPath } from "../env/lib";
import {
    isLoopbackUrl,
    parseAdbDevicesOutput,
    parseAndroidDoctorArgs,
} from "./android-doctor-helpers";

function fail(message: string): never {
    throw new Error(message);
}

function runAdbDevices(): string {
    const result = spawnSync("adb", ["devices", "-l"], {
        cwd: repoRootPath(),
        encoding: "utf8",
    });

    if (result.error) {
        fail(`Failed to run adb: ${result.error.message}`);
    }
    if (result.status !== 0) {
        fail((result.stderr || result.stdout || "adb devices failed").trim());
    }

    return result.stdout ?? "";
}

function main() {
    const args = parseAndroidDoctorArgs(process.argv.slice(2));
    const mobileEnvPath = repoRootPath(args.mobileEnvPath);
    const mobileEnv = loadDotEnvIfExists(mobileEnvPath);

    const serverUrl = mobileEnv.EXPO_PUBLIC_AGENTCHAT_SERVER_URL?.trim();
    const convexUrl = mobileEnv.EXPO_PUBLIC_CONVEX_URL?.trim();
    const adbDevicesOutput = runAdbDevices();
    const devices = parseAdbDevicesOutput(adbDevicesOutput).filter(
        (device) => device.state === "device",
    );

    if (!convexUrl) {
        fail(
            `Missing EXPO_PUBLIC_CONVEX_URL in ${path.relative(
                repoRootPath(),
                mobileEnvPath,
            )}.`,
        );
    }

    if (!serverUrl) {
        fail(
            `Missing EXPO_PUBLIC_AGENTCHAT_SERVER_URL in ${path.relative(
                repoRootPath(),
                mobileEnvPath,
            )}.`,
        );
    }

    if (isLoopbackUrl(serverUrl)) {
        fail(
            `EXPO_PUBLIC_AGENTCHAT_SERVER_URL must be a LAN-reachable host for Android device testing, not ${serverUrl}.`,
        );
    }

    if (devices.length === 0) {
        fail(
            "No Android devices are connected. Attach a device or start an emulator before running Android parity checks.",
        );
    }

    console.log("[agentchat] Android device doctor passed");
    console.log(`[agentchat] mobile env: ${args.mobileEnvPath}`);
    console.log(`[agentchat] backend url: ${serverUrl}`);
    console.log(`[agentchat] convex url: ${convexUrl}`);
    for (const device of devices) {
        console.log(
            `[agentchat] adb device: ${device.serial}${device.label ? ` (${device.label})` : ""}`,
        );
    }
    console.log(
        "[agentchat] next: run `bun run dev:all`, then use the installed Android dev client or `cd apps/mobile && bun run android`.",
    );
}

try {
    main();
} catch (error) {
    console.error(
        error instanceof Error ? error.message : "Android device doctor failed.",
    );
    process.exit(1);
}
