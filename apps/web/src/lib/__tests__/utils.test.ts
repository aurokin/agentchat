import { test, expect, describe } from "bun:test";
import { cn } from "../utils";

describe("utils.ts", () => {
    describe("cn", () => {
        test("merges tailwind classes with later class winning", () => {
            const result = cn("px-2", "px-4", "py-1");
            expect(result).toContain("px-4");
            expect(result).toContain("py-1");
        });

        test("handles clsx boolean input", () => {
            const result = cn(true && "bg-red-500", false && "bg-blue-500");
            expect(result).toBe("bg-red-500");
        });

        test("handles object input with truthy keys", () => {
            const result = cn({ active: true, disabled: false, loading: true });
            expect(result).toContain("active");
            expect(result).toContain("loading");
            expect(result).not.toContain("disabled");
        });

        test("handles mixed inputs", () => {
            const result = cn("base-class", true && "conditional-class", {
                another: true,
            });
            expect(result).toContain("base-class");
            expect(result).toContain("conditional-class");
            expect(result).toContain("another");
        });

        test("handles empty input", () => {
            const result = cn();
            expect(result).toBe("");
        });

        test("handles null and undefined", () => {
            const result = cn(null, undefined, "valid-class", undefined);
            expect(result).toBe("valid-class");
        });

        test("handles array input", () => {
            const result = cn(["class1", "class2"]);
            expect(result).toContain("class1");
            expect(result).toContain("class2");
        });

        test("handles mixed array with conditional", () => {
            const result = cn(["base", true && "conditional"]);
            expect(result).toContain("base");
            expect(result).toContain("conditional");
        });

        test("handles array with falsy values", () => {
            const result = cn(["base", false && "falsy", null, undefined]);
            expect(result).toBe("base");
        });

        test("handles deeply nested arrays", () => {
            const result = cn([["level1", ["level2"]]]);
            expect(result).toContain("level1");
            expect(result).toContain("level2");
        });

        test("preserves order of classes", () => {
            const result = cn("first", "second", "third");
            const classes = result.split(" ").filter((c: string) => c);
            expect(classes[0]).toBe("first");
            expect(classes[1]).toBe("second");
            expect(classes[2]).toBe("third");
        });

        test("handles multiple object conditions", () => {
            const result = cn(
                "base",
                { primary: true, secondary: false },
                { active: true, disabled: true },
            );
            expect(result).toContain("base");
            expect(result).toContain("primary");
            expect(result).toContain("active");
            expect(result).toContain("disabled");
            expect(result).not.toContain("secondary");
        });

        test("handles numbers and other types", () => {
            const result = cn("class", 0, 1, "another");
            expect(result).toContain("class");
            expect(result).toContain("another");
        });
    });
});
