import { describe, expect, test } from "bun:test";
import { resolveThemeScheme } from "@/contexts/theme-helpers";

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
