import path from "node:path";

import { describe, expect, test } from "bun:test";

import {
    isSiblingWorktreePath,
    normalizeWorktreeName,
} from "../local/lib/worktrees.ts";

describe("normalizeWorktreeName", () => {
    test("preserves already-safe names exactly", () => {
        expect(normalizeWorktreeName("foo--bar")).toBe("foo--bar");
        expect(normalizeWorktreeName("foo-")).toBe("foo-");
        expect(normalizeWorktreeName(".hidden-worktree")).toBe(
            ".hidden-worktree",
        );
    });

    test("normalizes path-like and unsafe labels", () => {
        expect(normalizeWorktreeName(" feature x/y ")).toBe("feature-x-y");
        expect(normalizeWorktreeName("release\\\\candidate")).toBe(
            "release-candidate",
        );
    });

    test("rejects empty and reserved dot names", () => {
        expect(normalizeWorktreeName("")).toBe("");
        expect(normalizeWorktreeName("   ")).toBe("");
        expect(normalizeWorktreeName(".")).toBe("");
        expect(normalizeWorktreeName("..")).toBe("");
    });
});

describe("isSiblingWorktreePath", () => {
    test("accepts direct siblings under the configured parent", () => {
        const worktreeParent = path.join(path.sep, "repo-parent");
        const checkoutPath = path.join(worktreeParent, "feature-branch");

        expect(isSiblingWorktreePath(checkoutPath, worktreeParent)).toBe(true);
    });

    test("rejects nested and unrelated paths", () => {
        const worktreeParent = path.join(path.sep, "repo-parent");

        expect(
            isSiblingWorktreePath(
                path.join(worktreeParent, "nested", "feature-branch"),
                worktreeParent,
            ),
        ).toBe(false);
        expect(
            isSiblingWorktreePath(
                path.join(path.sep, "other-parent", "feature-branch"),
                worktreeParent,
            ),
        ).toBe(false);
    });
});
