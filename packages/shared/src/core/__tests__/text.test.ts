import { describe, expect, it } from "bun:test";
import { normalizeAssistantDisplayText, trimTrailingEmptyLines } from "../text";

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

describe("normalizeAssistantDisplayText", () => {
    it("adds a missing space between adjacent sentences", () => {
        expect(
            normalizeAssistantDisplayText(
                "I am checking the repo.The layout is clear.",
            ),
        ).toBe("I am checking the repo. The layout is clear.");
    });

    it("adds paragraph breaks before report-style headings", () => {
        expect(
            normalizeAssistantDisplayText(
                "The structure is clear now. Report\n\nDetails follow.",
            ),
        ).toBe("The structure is clear now.\n\nReport\n\nDetails follow.");
    });

    it("adds a blank line before markdown list items", () => {
        expect(normalizeAssistantDisplayText("Summary\n- one\n- two")).toBe(
            "Summary\n\n- one\n- two",
        );
    });

    it("adds a paragraph break before inline numbered lists", () => {
        expect(
            normalizeAssistantDisplayText(
                "I will return a plan without editing files.1. Add a short introduction.",
            ),
        ).toBe(
            "I will return a plan without editing files.\n\n1. Add a short introduction.",
        );
    });

    it("leaves fenced code blocks untouched", () => {
        expect(
            normalizeAssistantDisplayText(
                "Intro.The code:\n```ts\nconst value = 1;\n```\n- item",
            ),
        ).toBe("Intro. The code:\n```ts\nconst value = 1;\n```\n\n- item");
    });
});
