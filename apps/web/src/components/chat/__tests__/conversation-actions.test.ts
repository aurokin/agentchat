import { test, expect, describe } from "bun:test";
import { getConversationActionMode } from "@/components/chat/conversationActions";

describe("getConversationActionMode", () => {
    test("returns mobile mode when isMobile true", () => {
        const mode = getConversationActionMode({
            isMobile: true,
            isDesktop: false,
        });

        expect(mode).toBe("mobile");
    });

    test("returns mobile mode when tablet false", () => {
        const mode = getConversationActionMode({
            isMobile: false,
            isDesktop: false,
        });

        expect(mode).toBe("mobile");
    });

    test("returns desktop hover mode when isDesktop true", () => {
        const mode = getConversationActionMode({
            isMobile: false,
            isDesktop: true,
        });

        expect(mode).toBe("desktop");
    });
});
