import { readArgValue } from "../env/lib";

export type AndroidDoctorArgs = {
    mobileEnvPath: string;
};

export function parseAndroidDoctorArgs(argv: string[]): AndroidDoctorArgs {
    let mobileEnvPath = "apps/mobile/.env";

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];

        if (arg === "--mobile-env") {
            const value = readArgValue(argv, "--mobile-env");
            if (!value) {
                throw new Error("--mobile-env requires a value.");
            }
            mobileEnvPath = value;
            index += 1;
            continue;
        }

        throw new Error(`Unsupported argument: ${arg}`);
    }

    return { mobileEnvPath };
}

export function isLoopbackUrl(value: string | undefined): boolean {
    if (!value) {
        return false;
    }

    return /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/i.test(
        value.trim(),
    );
}

export function parseAdbDevicesOutput(stdout: string): Array<{
    serial: string;
    state: string;
    label: string;
}> {
    return stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(
            (line) =>
                line.length > 0 &&
                !line.startsWith("List of devices attached"),
        )
        .map((line) => {
            const [serial = "", state = "", ...rest] = line.split(/\s+/u);
            return {
                serial,
                state,
                label: rest.join(" "),
            };
        })
        .filter((device) => device.serial.length > 0);
}
