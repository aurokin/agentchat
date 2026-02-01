import { describe, test, expect } from "bun:test";
import {
    isClipboardSupported,
    hasImageInClipboardEvent,
    readImageFromClipboardEvent,
} from "@/lib/clipboard";

describe("clipboard", () => {
    describe("isClipboardSupported", () => {
        test("isClipboardSupported returns false when navigator is undefined", () => {
            // In test environment without browser APIs
            const originalNavigator = global.navigator;
            // @ts-ignore
            delete global.navigator;

            expect(isClipboardSupported()).toBe(false);

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });

    describe("hasImageInClipboardEvent", () => {
        test("hasImageInClipboardEvent returns true when image present", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/png" }, { type: "text/plain" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });

        test("hasImageInClipboardEvent returns false when no image", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "text/plain" }, { type: "text/html" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent returns false when clipboardData is null", () => {
            const mockEvent = {
                clipboardData: null,
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent returns false when items is empty", () => {
            const mockEvent = {
                clipboardData: {
                    items: [],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent detects JPEG", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/jpeg" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });

        test("hasImageInClipboardEvent detects WebP", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/webp" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });
    });

    describe("readImageFromClipboardEvent", () => {
        test("readImageFromClipboardEvent returns image when present", () => {
            const mockBlob = new Blob(["test"], { type: "image/png" });
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "image/png",
                            getAsFile: () => mockBlob,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);

            expect(result).not.toBeNull();
            expect(result?.blob).toBe(mockBlob);
            expect(result?.mimeType).toBe("image/png");
        });

        test("readImageFromClipboardEvent returns null when no image", () => {
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "text/plain",
                            getAsFile: () => null,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });

        test("readImageFromClipboardEvent returns null when clipboardData is null", () => {
            const mockEvent = {
                clipboardData: null,
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });

        test("readImageFromClipboardEvent returns null when getAsFile returns null", () => {
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "image/png",
                            getAsFile: () => null,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });
    });
});
