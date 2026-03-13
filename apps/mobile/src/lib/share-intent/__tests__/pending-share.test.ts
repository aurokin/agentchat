import { describe, expect, test } from "bun:test";
import {
    consumePendingSharePayload,
    setPendingSharePayload,
} from "@/lib/share-intent/pending-share";

describe("pending share payload", () => {
    test("stores and consumes shared text once per chat", () => {
        setPendingSharePayload("chat-1", { text: "hello from share" });

        expect(consumePendingSharePayload("chat-1")).toEqual({
            text: "hello from share",
        });
        expect(consumePendingSharePayload("chat-1")).toBeNull();
    });

    test("keeps payloads isolated by chat id", () => {
        setPendingSharePayload("chat-a", { text: "alpha" });
        setPendingSharePayload("chat-b", { text: "beta" });

        expect(consumePendingSharePayload("chat-a")).toEqual({
            text: "alpha",
        });
        expect(consumePendingSharePayload("chat-b")).toEqual({
            text: "beta",
        });
    });
});
