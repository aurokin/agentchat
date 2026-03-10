import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { useRouter } from "expo-router";
import { parse, useURL } from "expo-linking";
import { useAppContext } from "@/contexts/AppContext";
import { useChatContext } from "@/contexts/ChatContext";
import {
    setPendingSharePayload,
    type PendingSharedFile,
} from "@/lib/share-intent/pending-share";

interface ParsedSharePayload {
    text: string;
    files: PendingSharedFile[];
    fingerprint: string;
}

function getStringParam(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        const first = value[0];
        return typeof first === "string" ? first : "";
    }
    return "";
}

function parseSharedFiles(value: string): PendingSharedFile[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => {
                if (typeof item !== "object" || item === null) {
                    return null;
                }
                const uri =
                    "uri" in item && typeof item.uri === "string"
                        ? item.uri
                        : null;
                if (!uri) return null;
                const mimeType =
                    "mimeType" in item && typeof item.mimeType === "string"
                        ? item.mimeType
                        : null;
                return { uri, mimeType };
            })
            .filter((item): item is PendingSharedFile => Boolean(item));
    } catch {
        return [];
    }
}

function parseSharePayload(url: string | null): ParsedSharePayload | null {
    if (!url) return null;
    const parsedUrl = parse(url);
    const sharedAt = getStringParam(parsedUrl.queryParams?.sharedAt);
    if (!sharedAt) return null;

    const text = getStringParam(parsedUrl.queryParams?.sharedText).trim();
    const files = parseSharedFiles(
        getStringParam(parsedUrl.queryParams?.sharedFiles),
    );
    if (!text && files.length === 0) return null;

    return {
        text,
        files,
        fingerprint: `${sharedAt}:${url}`,
    };
}

export function ShareIntentBridge(): ReactElement | null {
    const router = useRouter();
    const url = useURL();
    const { isInitialized, hasCompletedOnboarding } = useAppContext();
    const { createChat } = useChatContext();
    const isProcessingRef = useRef(false);
    const lastHandledRef = useRef<string | null>(null);

    const payload = useMemo(() => parseSharePayload(url), [url]);

    useEffect(() => {
        if (!isInitialized || !hasCompletedOnboarding) return;
        if (!payload) return;
        if (isProcessingRef.current) return;
        if (lastHandledRef.current === payload.fingerprint) return;

        isProcessingRef.current = true;
        lastHandledRef.current = payload.fingerprint;

        void (async () => {
            const chat = await createChat();
            setPendingSharePayload(chat.id, {
                text: payload.text,
                files: payload.files,
            });
            router.replace(`/chat/${chat.id}`);
        })()
            .catch((shareError) => {
                lastHandledRef.current = null;
                console.error("Failed to process share intent:", shareError);
            })
            .finally(() => {
                isProcessingRef.current = false;
            });
    }, [createChat, hasCompletedOnboarding, isInitialized, payload, router]);

    return null;
}
