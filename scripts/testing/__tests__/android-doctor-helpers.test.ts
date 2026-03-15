import { describe, expect, test } from "bun:test";

import {
    isLoopbackUrl,
    parseAdbDevicesOutput,
    parseAndroidDoctorArgs,
} from "../android-doctor-helpers";

describe("parseAndroidDoctorArgs", () => {
    test("returns defaults when no arguments are provided", () => {
        expect(parseAndroidDoctorArgs([])).toEqual({
            mobileEnvPath: "apps/mobile/.env",
        });
    });

    test("parses an explicit mobile env path", () => {
        expect(
            parseAndroidDoctorArgs([
                "--mobile-env",
                "apps/mobile/.env.android",
            ]),
        ).toEqual({
            mobileEnvPath: "apps/mobile/.env.android",
        });
    });

    test("rejects missing mobile env values", () => {
        expect(() => parseAndroidDoctorArgs(["--mobile-env"])).toThrow(
            "--mobile-env requires a value.",
        );
    });

    test("rejects unsupported arguments", () => {
        expect(() => parseAndroidDoctorArgs(["--broken"])).toThrow(
            "Unsupported argument: --broken",
        );
    });
});

describe("isLoopbackUrl", () => {
    test("detects localhost urls", () => {
        expect(isLoopbackUrl("http://localhost:3030")).toBe(true);
        expect(isLoopbackUrl("http://127.0.0.1:3030")).toBe(true);
        expect(isLoopbackUrl("http://0.0.0.0:3030")).toBe(true);
    });

    test("does not flag lan urls", () => {
        expect(isLoopbackUrl("http://192.168.50.11:3030")).toBe(false);
    });
});

describe("parseAdbDevicesOutput", () => {
    test("parses connected devices", () => {
        expect(
            parseAdbDevicesOutput(`List of devices attached
emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64
R3CT30ABC device usb:1-1
`),
        ).toEqual([
            {
                serial: "emulator-5554",
                state: "device",
                label: "product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64",
            },
            {
                serial: "R3CT30ABC",
                state: "device",
                label: "usb:1-1",
            },
        ]);
    });
});
