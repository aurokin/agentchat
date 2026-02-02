import { describe, test, expect } from "bun:test";
import {
    isClipboardSupported,
    hasImageInClipboardEvent,
    readImageFromClipboardEvent,
    readClipboardImage,
    hasClipboardImage,
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

        test("isClipboardSupported returns true with clipboard read", () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            expect(isClipboardSupported()).toBe(true);

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

    describe("readClipboardImage", () => {
        test("returns image from clipboard API", async () => {
            const originalNavigator = global.navigator;
            const blob = new Blob(["data"], { type: "image/png" });
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["text/plain", "image/png"],
                            getType: async () => blob,
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await readClipboardImage();
            expect(result?.mimeType).toBe("image/png");
            expect(result?.blob).toBe(blob);

            // @ts-ignore
            global.navigator = originalNavigator;
        });

        test("returns null when clipboard API fails", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => {
                        throw new Error("denied");
                    },
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await readClipboardImage();
            expect(result).toBeNull();

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });

    describe("hasClipboardImage", () => {
        test("returns true when clipboard contains image", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["image/jpeg"],
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await hasClipboardImage();
            expect(result).toBe(true);

            // @ts-ignore
            global.navigator = originalNavigator;
        });

        test("returns false when no image type", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["text/plain"],
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await hasClipboardImage();
            expect(result).toBe(false);

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });
});
