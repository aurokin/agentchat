import { ConvexReactClient } from "convex/react";
import { isConvexConfigured, getConvexUrl } from "./config";

let convexClient: ConvexReactClient | null = null;

export function getConvexClient(): ConvexReactClient | null {
    if (typeof window === "undefined") return null;
    if (!isConvexConfigured()) return null;

    if (!convexClient) {
        const url = getConvexUrl();
        if (url) {
            convexClient = new ConvexReactClient(url);
        }
    }
    return convexClient;
}

export function clearConvexClient(): void {
    convexClient = null;
}
