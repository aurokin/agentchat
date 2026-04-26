import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { writeJson, writeText } from "../local/lib/util.ts";

const tempDirs: string[] = [];

function createTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentchat-util-test-"));
    tempDirs.push(dir);
    return dir;
}

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

describe("local file writes", () => {
    test("writeText preserves an existing file when content is unchanged", () => {
        const filePath = path.join(createTempDir(), ".env.local");

        expect(writeText(filePath, "NEXT_PUBLIC_VALUE=one\n")).toBe(true);
        const firstStat = fs.statSync(filePath);

        expect(writeText(filePath, "NEXT_PUBLIC_VALUE=one\n")).toBe(false);
        const secondStat = fs.statSync(filePath);

        expect(secondStat.ino).toBe(firstStat.ino);
        expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    });

    test("writeJson preserves an existing file when serialized content is unchanged", () => {
        const filePath = path.join(createTempDir(), "manifest.json");

        expect(writeJson(filePath, { value: "one" })).toBe(true);
        const firstStat = fs.statSync(filePath);

        expect(writeJson(filePath, { value: "one" })).toBe(false);
        const secondStat = fs.statSync(filePath);

        expect(secondStat.ino).toBe(firstStat.ino);
        expect(secondStat.mtimeMs).toBe(firstStat.mtimeMs);
    });
});
