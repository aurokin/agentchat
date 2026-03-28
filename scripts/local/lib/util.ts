import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function nowIso(): string {
    return new Date().toISOString();
}

export function repoRootPath(...parts: string[]): string {
    return path.join(process.cwd(), ...parts);
}

export function ensureDir(absPath: string): void {
    fs.mkdirSync(absPath, { recursive: true });
}

export function readJsonIfExists<T>(absPath: string): T | null {
    if (!fs.existsSync(absPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(absPath, "utf8")) as T;
}

export function writeJson(absPath: string, value: unknown): void {
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, `${JSON.stringify(value, null, 4)}\n`, "utf8");
}

export function writeText(absPath: string, value: string): void {
    ensureDir(path.dirname(absPath));
    fs.writeFileSync(absPath, value, "utf8");
}

export function hashShort(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

export function sanitizeLabel(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function isStableCheckout(
    checkoutPath: string,
    stablePath: string,
): boolean {
    return path.resolve(checkoutPath) === path.resolve(stablePath);
}

export function fileContents(absPath: string): string | null {
    if (!fs.existsSync(absPath)) {
        return null;
    }

    return fs.readFileSync(absPath, "utf8");
}

export function hasFlag(flag: string): boolean {
    return process.argv.includes(flag);
}

export function relativeToRepo(absPath: string): string {
    return path.relative(process.cwd(), absPath) || ".";
}

export function diffText(expected: string, actual: string): boolean {
    return expected !== actual;
}
