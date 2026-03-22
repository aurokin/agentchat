import { useEffect, useMemo, useRef, type ReactElement } from "react";
import { useRouter } from "expo-router";
import { parse, useURL } from "expo-linking";
import { useAppContext } from "@/contexts/AppContext";
import { useChatContext } from "@/contexts/ChatContext";
import { buildChatRouteId } from "@/lib/home-chat-route";
import { setPendingSharePayload } from "@/lib/share-intent/pending-share";

interface ParsedSharePayload {
    text: string;
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

function parseSharePayload(url: string | null): ParsedSharePayload | null {
    if (!url) return null;
    const parsedUrl = parse(url);
    const sharedAt = getStringParam(parsedUrl.queryParams?.sharedAt);
    if (!sharedAt) return null;

    const text = getStringParam(parsedUrl.queryParams?.sharedText).trim();
    if (!text) return null;

    return {
        text,
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
            setPendingSharePayload(chat.id, { text: payload.text });
            router.replace(
                `/chat/${buildChatRouteId({
                    chatId: chat.id,
                    agentId: chat.agentId,
                })}`,
            );
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
