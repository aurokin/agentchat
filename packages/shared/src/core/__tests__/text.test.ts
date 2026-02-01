import { describe, expect, it } from "bun:test";
import { trimTrailingEmptyLines } from "../text";

describe("trimTrailingEmptyLines", () => {
    it("returns undefined for undefined input", () => {
        expect(trimTrailingEmptyLines(undefined)).toBeUndefined();
    });

    it("removes trailing empty lines", () => {
        const value = "first\n\nsecond\n\n\n";
        expect(trimTrailingEmptyLines(value)).toBe("first\n\nsecond");
    });

    it("keeps content when no trailing empty lines", () => {
        const value = "first\nsecond";
        expect(trimTrailingEmptyLines(value)).toBe(value);
    });
});
