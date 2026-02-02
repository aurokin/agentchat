"use client";

import { useState, useEffect, useRef } from "react";

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(false);
    const mediaRef = useRef<MediaQueryList | null>(null);
    const listenerRef = useRef<((e: MediaQueryListEvent) => void) | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        mediaRef.current = window.matchMedia(query);
        const media = mediaRef.current;

        const updateMatches = () => {
            if (mediaRef.current) {
                setMatches(mediaRef.current.matches);
            }
        };

        listenerRef.current = (e: MediaQueryListEvent) => {
            updateMatches();
        };

        media.addEventListener("change", listenerRef.current);
        updateMatches();

        return () => {
            if (listenerRef.current && mediaRef.current) {
                mediaRef.current.removeEventListener(
                    "change",
                    listenerRef.current,
                );
            }
        };
    }, [query]);

    return matches;
}

export function useIsMobile(): boolean {
    return useMediaQuery("(max-width: 767px)");
}

export function useIsTablet(): boolean {
    return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

export function useIsDesktop(): boolean {
    return useMediaQuery("(min-width: 1024px)");
}

export function getBreakpointFromFlags(
    isMobile: boolean,
    isTablet: boolean,
): "mobile" | "tablet" | "desktop" {
    if (isMobile) return "mobile";
    if (isTablet) return "tablet";
    return "desktop";
}

export function useBreakpoint(): "mobile" | "tablet" | "desktop" {
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();

    return getBreakpointFromFlags(isMobile, isTablet);
}

export function useTouchDevice(): boolean {
    return useMediaQuery("(pointer: coarse)");
}
