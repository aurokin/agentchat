import { describe, expect, test } from "bun:test";

import {
    buildBrowserConfidenceFailureReport,
    buildBrowserConfidenceSuccessReport,
    formatBrowserConfidenceText,
    getBrowserConfidenceScenarios,
    parseBrowserConfidenceArgs,
} from "../browser-confidence-helpers";

describe("parseBrowserConfidenceArgs", () => {
    test("returns defaults when no arguments are provided", () => {
        expect(parseBrowserConfidenceArgs([])).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "full",
            json: false,
        });
    });

    test("parses base url and trims trailing slashes", () => {
        expect(
            parseBrowserConfidenceArgs([
                "--base-url",
                "http://192.168.1.20:4040///",
            ]),
        ).toEqual({
            baseUrl: "http://192.168.1.20:4040",
            mode: "full",
            json: false,
        });
    });

    test("parses an explicit mode", () => {
        expect(parseBrowserConfidenceArgs(["--mode", "interrupt"])).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "interrupt",
            json: false,
        });
    });

    test("parses the long-stream mode", () => {
        expect(parseBrowserConfidenceArgs(["--mode", "long-stream"])).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "long-stream",
            json: false,
        });
    });

    test("parses explicit json output", () => {
        expect(parseBrowserConfidenceArgs(["--json"])).toEqual({
            baseUrl: "http://127.0.0.1:4040",
            mode: "full",
            json: true,
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
        expect(() => parseBrowserConfidenceArgs(["--mode", "broken"])).toThrow(
            "--mode must be smoke, interrupt, refresh, long-stream, or full.",
        );
    });
});

describe("browser confidence reports", () => {
    test("expands full mode into all scenarios", () => {
        expect(getBrowserConfidenceScenarios("full")).toEqual([
            { name: "smoke", status: "passed" },
            { name: "interrupt", status: "passed" },
            { name: "refresh", status: "passed" },
            { name: "long-stream", status: "passed" },
        ]);
    });

    test("builds a structured success report", () => {
        const report = buildBrowserConfidenceSuccessReport({
            args: {
                baseUrl: "http://127.0.0.1:4040",
                mode: "smoke",
                json: true,
            },
            authProviderKind: "local",
            startedAtMs: Date.UTC(2026, 2, 15, 15, 0, 0),
            completedAtMs: Date.UTC(2026, 2, 15, 15, 0, 2),
            artifactPaths: ["/tmp/browser-confidence-smoke.png"],
        });

        expect(report).toMatchObject({
            ok: true,
            script: "browser-confidence",
            mode: "smoke",
            authProviderKind: "local",
            durationMs: 2000,
            artifactPaths: ["/tmp/browser-confidence-smoke.png"],
            scenarios: [{ name: "smoke", status: "passed" }],
        });
        expect(formatBrowserConfidenceText(report)).toContain(
            "artifacts=/tmp/browser-confidence-smoke.png",
        );
    });

    test("builds a structured failure report", () => {
        const report = buildBrowserConfidenceFailureReport({
            args: null,
            startedAtMs: Date.UTC(2026, 2, 15, 15, 0, 0),
            completedAtMs: Date.UTC(2026, 2, 15, 15, 0, 1),
            issueCode: "browser_confidence_invalid_arguments",
            message: "Unsupported argument: --broken",
        });

        expect(report).toMatchObject({
            ok: false,
            issueCode: "browser_confidence_invalid_arguments",
            mode: null,
            baseUrl: null,
            durationMs: 1000,
        });
        expect(formatBrowserConfidenceText(report)).toContain(
            "browser_confidence_invalid_arguments",
        );
    });
});
