import { describe, expect, test } from "bun:test";
import {
    getEffectiveQueryArgs,
    selectSafeCallback,
} from "@/hooks/useConvexSafe";

describe("getEffectiveQueryArgs", () => {
    test("returns args when available", () => {
        const args = { id: "chat-1" };
        const result = getEffectiveQueryArgs(true, args);
        expect(result).toEqual(args);
    });

    test("returns skip when unavailable", () => {
        const args = { id: "chat-2" };
        const result = getEffectiveQueryArgs(false, args);
        expect(result).toBe("skip");
    });

    test("keeps skip when provided", () => {
        const result = getEffectiveQueryArgs(true, "skip");
        expect(result).toBe("skip");
    });
});

describe("selectSafeCallback", () => {
    test("returns real callback when available", () => {
        const real = (value: string) => `real-${value}`;
        const noop = (_value: string) => "noop";
        const selected = selectSafeCallback(true, real, noop);

        expect(selected("value")).toBe("real-value");
    });

    test("returns noop callback when unavailable", () => {
        const real = (value: string) => `real-${value}`;
        const noop = (_value: string) => "noop";
        const selected = selectSafeCallback(false, real, noop);

        expect(selected("value")).toBe("noop");
    });
});
