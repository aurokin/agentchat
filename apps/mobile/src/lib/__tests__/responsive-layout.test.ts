import { describe, expect, test } from "bun:test";
import { resolveResponsiveLayout } from "@/lib/responsive-layout";

describe("resolveResponsiveLayout", () => {
    test("keeps phones out of tablet landscape mode", () => {
        expect(resolveResponsiveLayout({ width: 430, height: 932 })).toEqual({
            isTablet: false,
            isLandscape: false,
            useTabletLandscapeLayout: false,
        });
        expect(resolveResponsiveLayout({ width: 932, height: 430 })).toEqual({
            isTablet: false,
            isLandscape: true,
            useTabletLandscapeLayout: false,
        });
    });

    test("treats mini tablets as tablets", () => {
        expect(resolveResponsiveLayout({ width: 744, height: 1133 })).toEqual({
            isTablet: true,
            isLandscape: false,
            useTabletLandscapeLayout: false,
        });
        expect(resolveResponsiveLayout({ width: 1133, height: 744 })).toEqual({
            isTablet: true,
            isLandscape: true,
            useTabletLandscapeLayout: true,
        });
    });

    test("prefers the horizontal layout for landscape tablets", () => {
        expect(resolveResponsiveLayout({ width: 1194, height: 834 })).toEqual({
            isTablet: true,
            isLandscape: true,
            useTabletLandscapeLayout: true,
        });
    });
});
