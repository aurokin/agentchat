import { describe, expect, test } from "bun:test";

import { formatDisplayNameFromUsername } from "../local-auth-users";
import {
    parseCreateLocalUserArgs,
    resolveDisplayName,
} from "../create-local-user-helpers";

describe("local auth user helpers", () => {
    test("formats a display name from username", () => {
        expect(formatDisplayNameFromUsername("smoke_1")).toBe("Smoke 1");
        expect(formatDisplayNameFromUsername("warcraft-simple")).toBe(
            "Warcraft Simple",
        );
    });

    test("parses create-local-user args", () => {
        expect(
            parseCreateLocalUserArgs([
                "--username",
                "alice",
                "--display-name",
                "Alice Example",
                "--password",
                "secret",
            ]),
        ).toEqual({
            username: "alice",
            displayName: "Alice Example",
            password: "secret",
        });
    });

    test("resolves display name with fallback", () => {
        expect(resolveDisplayName("smoke_2", null)).toBe("Smoke 2");
        expect(resolveDisplayName("smoke_2", "Smoke Two")).toBe("Smoke Two");
    });
});
