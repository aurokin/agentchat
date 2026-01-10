import { test, expect, describe } from "bun:test";

describe("Skeleton components", () => {
    describe("Skeleton", () => {
        test("Skeleton module loads without error", () => {
            const mod = require("../../ui/Skeleton");
            expect(mod.Skeleton).toBeDefined();
            expect(typeof mod.Skeleton).toBe("function");
        });

        test("Skeleton accepts className prop", () => {
            const mod = require("../../ui/Skeleton");
            const skeleton = mod.Skeleton;
            expect(skeleton.length).toBe(1);
        });
    });

    describe("ChatListSkeleton", () => {
        test("ChatListSkeleton module loads without error", () => {
            const mod = require("../ChatListSkeleton");
            expect(mod.ChatListSkeleton).toBeDefined();
            expect(typeof mod.ChatListSkeleton).toBe("function");
        });
    });

    describe("MessageListSkeleton", () => {
        test("MessageListSkeleton module loads without error", () => {
            const mod = require("../MessageListSkeleton");
            expect(mod.MessageListSkeleton).toBeDefined();
            expect(typeof mod.MessageListSkeleton).toBe("function");
        });

        test("MessageListSkeleton accepts count and streaming props", () => {
            const mod = require("../MessageListSkeleton");
            const skeleton = mod.MessageListSkeleton;
            expect(skeleton.length).toBe(1);
        });
    });
});
