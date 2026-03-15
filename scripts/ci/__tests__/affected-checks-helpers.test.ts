import { describe, expect, test } from "bun:test";

import {
    buildAffectedCommands,
    detectAffectedTargets,
    parseAffectedArgs,
} from "../affected-checks-helpers";

describe("parseAffectedArgs", () => {
    test("returns defaults with no args", () => {
        expect(parseAffectedArgs([])).toEqual({
            baseRef: null,
            files: [],
        });
    });

    test("parses an explicit base ref and files", () => {
        expect(
            parseAffectedArgs([
                "--base",
                "origin/main",
                "apps/web/src/app/page.tsx",
                "packages/shared/src/index.ts",
            ]),
        ).toEqual({
            baseRef: "origin/main",
            files: [
                "apps/web/src/app/page.tsx",
                "packages/shared/src/index.ts",
            ],
        });
    });

    test("rejects missing base ref", () => {
        expect(() => parseAffectedArgs(["--base"])).toThrow(
            "--base requires a git ref.",
        );
    });

    test("rejects unsupported flags", () => {
        expect(() => parseAffectedArgs(["--unknown"])).toThrow(
            "Unsupported argument: --unknown",
        );
    });
});

describe("detectAffectedTargets", () => {
    test("detects app and package targets", () => {
        expect(
            Array.from(
                detectAffectedTargets([
                    "apps/web/src/app/page.tsx",
                    "apps/server/src/index.ts",
                    "packages/shared/src/index.ts",
                ]),
            ).sort(),
        ).toEqual(["server", "shared", "web"]);
    });

    test("treats scripts and root tooling files as repo-wide", () => {
        expect(
            Array.from(
                detectAffectedTargets([
                    "scripts/check-architecture.ts",
                    "package.json",
                ]),
            ).sort(),
        ).toEqual(["repo"]);
    });
});

describe("buildAffectedCommands", () => {
    test("returns repo-wide verification when repo target is present", () => {
        expect(buildAffectedCommands(new Set(["repo", "web"]))).toEqual([
            { label: "repo", cmd: "bun run verify:ci" },
        ]);
    });

    test("returns ordered health commands for affected surfaces", () => {
        expect(
            buildAffectedCommands(new Set(["shared", "mobile", "web"])),
        ).toEqual([
            { label: "web", cmd: "bun run health:web" },
            { label: "mobile", cmd: "bun run health:mobile" },
            { label: "shared", cmd: "bun run health:shared" },
        ]);
    });
});
