import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
    parseConvexRunOutput,
    trimTrailingSlash,
    tryReadEnvValue,
} from "../lib";

const tempRoots: string[] = [];

function makeTempDir(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `${name}-`));
    tempRoots.push(dir);
    return dir;
}

afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
        rmSync(tempRoot, { force: true, recursive: true });
    }
});

describe("testing helper library", () => {
    test("trimTrailingSlash removes trailing slashes only", () => {
        expect(trimTrailingSlash("http://localhost:3030///")).toBe(
            "http://localhost:3030",
        );
        expect(trimTrailingSlash("http://localhost:3030/path")).toBe(
            "http://localhost:3030/path",
        );
    });

    test("tryReadEnvValue reads dotenv-style values", () => {
        const dir = makeTempDir("testing-env");
        const filePath = path.join(dir, ".env.local");
        writeFileSync(
            filePath,
            [
                "# Comment",
                "BACKEND_TOKEN_SECRET=secret-value",
                "EMPTY_VALUE=",
                "RUNTIME_INGRESS_SECRET=runtime-value",
                "",
            ].join("\n"),
            "utf8",
        );

        expect(tryReadEnvValue(filePath, "BACKEND_TOKEN_SECRET")).toBe(
            "secret-value",
        );
        expect(tryReadEnvValue(filePath, "EMPTY_VALUE")).toBeNull();
        expect(tryReadEnvValue(filePath, "MISSING")).toBeNull();
    });

    test("parseConvexRunOutput handles pretty-printed JSON objects", () => {
        const output = [
            "- Preparing Convex functions...",
            "✔ Convex functions ready! (1.11s)",
            "{",
            '  "expiresAt": 1773450790,',
            '  "token": "abc"',
            "}",
        ].join("\n");

        expect(parseConvexRunOutput(output)).toEqual({
            expiresAt: 1773450790,
            token: "abc",
        });
    });

    test("parseConvexRunOutput handles scalar JSON output", () => {
        expect(parseConvexRunOutput('"manual-test-sub"\n')).toBe(
            "manual-test-sub",
        );
        expect(parseConvexRunOutput("")).toBeNull();
    });
});
