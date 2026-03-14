import { describe, expect, test } from "bun:test";

import { parseRuntimeRepeatSmokeArgs } from "../runtime-repeat-smoke-helpers";

describe("parseRuntimeRepeatSmokeArgs", () => {
    test("returns defaults", () => {
        expect(parseRuntimeRepeatSmokeArgs([])).toEqual({
            iterations: 3,
            serverUrl: null,
            keepGoing: false,
        });
    });

    test("parses explicit iterations and server url", () => {
        expect(
            parseRuntimeRepeatSmokeArgs([
                "--iterations",
                "5",
                "--server-url",
                "http://127.0.0.1:3030",
                "--keep-going",
            ]),
        ).toEqual({
            iterations: 5,
            serverUrl: "http://127.0.0.1:3030",
            keepGoing: true,
        });
    });

    test("rejects invalid iterations", () => {
        expect(() =>
            parseRuntimeRepeatSmokeArgs(["--iterations", "0"]),
        ).toThrow("--iterations must be a positive integer.");
    });

    test("rejects unsupported flags", () => {
        expect(() =>
            parseRuntimeRepeatSmokeArgs(["--wat"]),
        ).toThrow("Unsupported argument: --wat");
    });
});
