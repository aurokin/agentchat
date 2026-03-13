import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
    getConvexUrl,
    isConvexConfigured,
    isServer,
} from "@/lib/workspace/config";

describe("sync config client behavior", () => {
    const originalWindow = globalThis.window;
    const originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

    beforeEach(() => {
        globalThis.window = {} as Window & typeof globalThis;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        if (originalConvexUrl !== undefined) {
            process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
        } else {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;
        }
    });

    it("isServer returns false when window exists", () => {
        expect(isServer()).toBe(false);
    });

    it("isConvexConfigured returns false for missing or invalid URL", () => {
        delete process.env.NEXT_PUBLIC_CONVEX_URL;
        expect(isConvexConfigured()).toBe(false);

        process.env.NEXT_PUBLIC_CONVEX_URL = "";
        expect(isConvexConfigured()).toBe(false);

        process.env.NEXT_PUBLIC_CONVEX_URL = "http://example.com";
        expect(isConvexConfigured()).toBe(false);
    });

    it("isConvexConfigured returns true for https URL", () => {
        process.env.NEXT_PUBLIC_CONVEX_URL =
            "https://valid-convex-url.convex.cloud";
        expect(isConvexConfigured()).toBe(true);
    });

    it("getConvexUrl returns configured value", () => {
        process.env.NEXT_PUBLIC_CONVEX_URL =
            "https://valid-convex-url.convex.cloud";
        expect(getConvexUrl()).toBe("https://valid-convex-url.convex.cloud");
    });

    it("getConvexUrl returns null when not configured", () => {
        delete process.env.NEXT_PUBLIC_CONVEX_URL;
        expect(getConvexUrl()).toBeNull();
    });
});
