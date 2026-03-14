import { describe, expect, test } from "bun:test";

import { parseBrowserConfidenceArgs } from "../browser-confidence-helpers";

describe("parseBrowserConfidenceArgs", () => {
    test("returns defaults when no arguments are provided", () => {
        expect(parseBrowserConfidenceArgs([])).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "full",
        });
    });

    test("parses base url and trims trailing slashes", () => {
        expect(
            parseBrowserConfidenceArgs([
                "--base-url",
                "http://192.168.50.11:4040///",
            ]),
        ).toEqual({
            baseUrl: "http://192.168.50.11:4040",
            mode: "full",
        });
    });

    test("parses an explicit mode", () => {
        expect(
            parseBrowserConfidenceArgs(["--mode", "interrupt"]),
        ).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "interrupt",
        });
    });

    test("rejects unsupported arguments", () => {
        expect(() => parseBrowserConfidenceArgs(["--unknown"])).toThrow(
            "Unsupported argument: --unknown",
        );
    });

    test("rejects missing base url values", () => {
        expect(() => parseBrowserConfidenceArgs(["--base-url"])).toThrow(
            "--base-url requires a value.",
        );
    });

    test("rejects unsupported modes", () => {
        expect(() =>
            parseBrowserConfidenceArgs(["--mode", "broken"]),
        ).toThrow("--mode must be smoke, interrupt, refresh, or full.");
    });
});
