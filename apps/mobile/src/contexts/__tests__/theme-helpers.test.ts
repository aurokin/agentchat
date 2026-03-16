import { describe, expect, test } from "bun:test";
import {
    coalesceSystemScheme,
    resolveThemeScheme,
} from "@/contexts/theme-helpers";

describe("coalesceSystemScheme", () => {
    test("keeps the last known scheme when the next reading is unavailable", () => {
        expect(
            coalesceSystemScheme({
                nextSystemScheme: null,
                previousSystemScheme: "dark",
            }),
        ).toBe("dark");
    });

    test("accepts a new concrete scheme", () => {
        expect(
            coalesceSystemScheme({
                nextSystemScheme: "light",
                previousSystemScheme: "dark",
            }),
        ).toBe("light");
    });
});

describe("resolveThemeScheme", () => {
    test("returns the explicit light selection unchanged", () => {
        expect(
            resolveThemeScheme({
                userTheme: "light",
                systemScheme: "dark",
            }),
        ).toBe("light");
    });

    test("returns the explicit dark selection unchanged", () => {
        expect(
            resolveThemeScheme({
                userTheme: "dark",
                systemScheme: "light",
            }),
        ).toBe("dark");
    });

    test("maps the system selection to dark when the device is dark", () => {
        expect(
            resolveThemeScheme({
                userTheme: "system",
                systemScheme: "dark",
            }),
        ).toBe("dark");
    });

    test("maps the system selection to light when the device is light", () => {
        expect(
            resolveThemeScheme({
                userTheme: "system",
                systemScheme: "light",
            }),
        ).toBe("light");
    });

    test("falls back to light when the system scheme is unavailable", () => {
        expect(
            resolveThemeScheme({
                userTheme: "system",
                systemScheme: null,
            }),
        ).toBe("light");
    });
});
