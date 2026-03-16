import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    loadWebLanConfidenceConfig,
    parseWebLanConfidenceArgs,
} from "../web-lan-confidence-helpers";

describe("parseWebLanConfidenceArgs", () => {
    test("returns defaults when no arguments are provided", () => {
        expect(parseWebLanConfidenceArgs([])).toEqual({
            configPath: "scripts/testing/web-lan-confidence.local.json",
            json: false,
        });
    });

    test("parses explicit json output", () => {
        expect(parseWebLanConfidenceArgs(["--json"])).toEqual({
            configPath: "scripts/testing/web-lan-confidence.local.json",
            json: true,
        });
    });

    test("parses an explicit config path", () => {
        expect(
            parseWebLanConfidenceArgs([
                "--config",
                "/tmp/web-lan-confidence.local.json",
            ]),
        ).toEqual({
            configPath: "/tmp/web-lan-confidence.local.json",
            json: false,
        });
    });

    test("rejects missing config values", () => {
        expect(() => parseWebLanConfidenceArgs(["--config"])).toThrow(
            "--config requires a value.",
        );
    });

    test("rejects unsupported arguments", () => {
        expect(() => parseWebLanConfidenceArgs(["--broken"])).toThrow(
            "Unsupported argument: --broken",
        );
    });
});

describe("loadWebLanConfidenceConfig", () => {
    test("loads and trims the configured base url", () => {
        const repoRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "agentchat-web-lan-confidence-"),
        );
        const configPath = path.join(repoRoot, "scripts/testing/config.local.json");
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(
            configPath,
            JSON.stringify({
                baseUrl: "http://luma.home.arpa:4040///",
            }),
            "utf8",
        );

        expect(
            loadWebLanConfidenceConfig({
                repoRoot,
                configPath: "scripts/testing/config.local.json",
            }),
        ).toEqual({
            baseUrl: "http://luma.home.arpa:4040",
        });
    });

    test("rejects missing config files with setup guidance", () => {
        const repoRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "agentchat-web-lan-confidence-"),
        );

        expect(() =>
            loadWebLanConfidenceConfig({
                repoRoot,
                configPath: "scripts/testing/web-lan-confidence.local.json",
            }),
        ).toThrow(
            "Copy scripts/testing/web-lan-confidence.local.example.json and adjust it for your LAN host.",
        );
    });

    test("rejects configs without a base url", () => {
        const repoRoot = fs.mkdtempSync(
            path.join(os.tmpdir(), "agentchat-web-lan-confidence-"),
        );
        const configPath = path.join(repoRoot, "scripts/testing/config.local.json");
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({}), "utf8");

        expect(() =>
            loadWebLanConfidenceConfig({
                repoRoot,
                configPath: "scripts/testing/config.local.json",
            }),
        ).toThrow('must define a non-empty "baseUrl"');
    });
});
