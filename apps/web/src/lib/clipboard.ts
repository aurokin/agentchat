// Clipboard image handling utilities

export interface ClipboardImage {
    blob: Blob;
    mimeType: string;
}

// Check if the Clipboard API is supported
export function isClipboardSupported(): boolean {
    return (
        typeof navigator !== "undefined" &&
        "clipboard" in navigator &&
        "read" in navigator.clipboard
    );
}

// Check if clipboard contains an image (via paste event)
export function hasImageInClipboardEvent(event: ClipboardEvent): boolean {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
        if (item.type.startsWith("image/")) {
            return true;
        }
    }
    return false;
}

// Read image from clipboard paste event
export function readImageFromClipboardEvent(
    event: ClipboardEvent,
): ClipboardImage | null {
    const items = event.clipboardData?.items;
    if (!items) return null;

    for (const item of items) {
        if (item.type.startsWith("image/")) {
            const blob = item.getAsFile();
            if (blob) {
                return {
                    blob,
                    mimeType: item.type,
                };
            }
        }
    }
    return null;
}

// Read image from clipboard using Clipboard API (async)
export async function readClipboardImage(): Promise<ClipboardImage | null> {
    if (!isClipboardSupported()) {
        return null;
    }

    try {
        const items = await navigator.clipboard.read();

        for (const item of items) {
            // Find an image type in the clipboard item
            const imageType = item.types.find((type) =>
                type.startsWith("image/"),
            );
            if (imageType) {
                const blob = await item.getType(imageType);
                return {
                    blob,
                    mimeType: imageType,
                };
            }
        }
    } catch {
        // Clipboard access denied or no image available
        return null;
    }

    return null;
}

// Check if clipboard has an image using Clipboard API (async)
export async function hasClipboardImage(): Promise<boolean> {
    if (!isClipboardSupported()) {
        return false;
    }

    try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
            if (item.types.some((type) => type.startsWith("image/"))) {
                return true;
            }
        }
    } catch {
        return false;
    }

    return false;
}
