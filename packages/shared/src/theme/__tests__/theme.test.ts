import { describe, expect, it } from "bun:test";
import type { ThemeColors } from "../types";
import { lightColors } from "../light";
import { darkColors } from "../dark";
import {
    themeColorToCssVar,
    themeToCssVariables,
    themeToCssText,
} from "../css-mapping";

/** CSS variable names that the web app's globals.css previously defined. */
const existingWebCssVars = [
    "--background",
    "--background-elevated",
    "--foreground",
    "--foreground-muted",
    "--primary",
    "--primary-glow",
    "--primary-foreground",
    "--muted",
    "--muted-foreground",
    "--border",
    "--border-accent",
    "--input",
    "--success",
    "--warning",
    "--error",
];

describe("themeColorToCssVar", () => {
    it("has a mapping for every ThemeColors key", () => {
        const themeKeys = Object.keys(lightColors) as (keyof ThemeColors)[];
        for (const key of themeKeys) {
            expect(themeColorToCssVar[key]).toBeDefined();
            expect(themeColorToCssVar[key]).toStartWith("--");
        }
    });

    it("has no extra keys beyond ThemeColors", () => {
        const mappingKeys = Object.keys(themeColorToCssVar);
        const themeKeys = Object.keys(lightColors);
        expect(mappingKeys.sort()).toEqual(themeKeys.sort());
    });
});

describe("themeToCssVariables", () => {
    it("returns correct number of variables for dark colors", () => {
        const vars = themeToCssVariables(darkColors);
        const expectedCount = Object.keys(themeColorToCssVar).length;
        expect(Object.keys(vars)).toHaveLength(expectedCount);
    });

    it("returns correct number of variables for light colors", () => {
        const vars = themeToCssVariables(lightColors);
        const expectedCount = Object.keys(themeColorToCssVar).length;
        expect(Object.keys(vars)).toHaveLength(expectedCount);
    });

    it("all values are non-empty strings", () => {
        for (const colors of [lightColors, darkColors]) {
            const vars = themeToCssVariables(colors);
            for (const [key, value] of Object.entries(vars)) {
                expect(value).not.toBe("");
                expect(typeof value).toBe("string");
                // Verify the key is a valid CSS custom property
                expect(key).toStartWith("--");
            }
        }
    });

    it("includes all existing web CSS variable names", () => {
        const darkVars = themeToCssVariables(darkColors);
        const lightVars = themeToCssVariables(lightColors);

        for (const cssVar of existingWebCssVars) {
            expect(darkVars[cssVar]).toBeDefined();
            expect(lightVars[cssVar]).toBeDefined();
        }
    });
});

describe("themeToCssText", () => {
    it("produces valid CSS property declarations", () => {
        const text = themeToCssText(darkColors);
        const lines = text.split("\n").map((l) => l.trim());
        for (const line of lines) {
            expect(line).toMatch(/^--[\w-]+:\s*.+;$/);
        }
    });

    it("contains every mapped CSS variable", () => {
        const text = themeToCssText(lightColors);
        for (const cssVar of Object.values(themeColorToCssVar)) {
            expect(text).toContain(cssVar);
        }
    });
});

describe("palette values", () => {
    it("dark and light palettes have the same keys", () => {
        expect(Object.keys(darkColors).sort()).toEqual(
            Object.keys(lightColors).sort(),
        );
    });
});
