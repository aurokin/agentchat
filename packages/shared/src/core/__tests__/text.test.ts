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

    it("trims trailing CRLF empty lines", () => {
        const value = "first\r\nsecond\r\n\r\n";
        expect(trimTrailingEmptyLines(value)).toBe("first\nsecond");
    });

    it("trims whitespace-only trailing lines", () => {
        const value = "first\n \n\t\n";
        expect(trimTrailingEmptyLines(value)).toBe("first");
    });
});
