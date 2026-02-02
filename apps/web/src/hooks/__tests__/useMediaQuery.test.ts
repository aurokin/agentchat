import { describe, expect, test } from "bun:test";
import { getBreakpointFromFlags } from "@/hooks/useMediaQuery";

describe("getBreakpointFromFlags", () => {
    test("returns mobile when mobile flag is true", () => {
        expect(getBreakpointFromFlags(true, false)).toBe("mobile");
    });

    test("returns tablet when tablet flag is true", () => {
        expect(getBreakpointFromFlags(false, true)).toBe("tablet");
    });

    test("returns desktop when both flags are false", () => {
        expect(getBreakpointFromFlags(false, false)).toBe("desktop");
    });

    test("prefers mobile when both flags are true", () => {
        expect(getBreakpointFromFlags(true, true)).toBe("mobile");
    });
});
