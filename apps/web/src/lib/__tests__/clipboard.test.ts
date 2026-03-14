import { afterEach, describe, expect, mock, test } from "bun:test";

import { copyTextToClipboard } from "@/lib/clipboard";

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

afterEach(() => {
    globalThis.navigator = originalNavigator;
    globalThis.document = originalDocument;
});

describe("copyTextToClipboard", () => {
    test("uses navigator.clipboard when available", async () => {
        const writeText = mock(async () => undefined);
        globalThis.navigator = {
            clipboard: {
                writeText,
            },
        } as unknown as Navigator;

        await copyTextToClipboard("hello");

        expect(writeText).toHaveBeenCalledWith("hello");
    });

    test("falls back to document.execCommand when clipboard api is unavailable", async () => {
        const appended: unknown[] = [];
        const removed: unknown[] = [];
        const textarea = {
            value: "",
            style: {} as Record<string, string>,
            setAttribute: mock(() => undefined),
            focus: mock(() => undefined),
            select: mock(() => undefined),
        };

        globalThis.navigator = {} as unknown as Navigator;
        globalThis.document = {
            createElement: mock(() => textarea),
            body: {
                appendChild: mock((node) => {
                    appended.push(node);
                }),
                removeChild: mock((node) => {
                    removed.push(node);
                }),
            },
            execCommand: mock(() => true),
        } as unknown as Document;

        await copyTextToClipboard("hello");

        expect(textarea.value).toBe("hello");
        expect(appended).toHaveLength(1);
        expect(removed).toHaveLength(1);
    });
});
