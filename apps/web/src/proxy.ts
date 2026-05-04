import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

// Only enforce security headers outside local development (`next dev`).
const isProduction = process.env.NODE_ENV === "production";

function createNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);

    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }

    // base64 nonce value for CSP
    return btoa(binary);
}

function isSecureRequest(request: NextRequest): boolean {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if (forwardedProto) {
        return forwardedProto.split(",")[0]?.trim() === "https";
    }

    return request.nextUrl.protocol === "https:";
}

function applyCommonSecurityHeaders(
    response: NextResponse,
    options: { secureRequest: boolean },
): void {
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");

    // Prevent this origin from being persisted in a less-isolated agent cluster.
    response.headers.set("Origin-Agent-Cluster", "?1");

    // Disable deprecated browser XSS auditor behavior.
    response.headers.set("X-XSS-Protection", "0");

    // Lock down powerful features in embedded contexts; keep top-level behavior.
    response.headers.set(
        "Permissions-Policy",
        "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()",
    );

    if (options.secureRequest) {
        response.headers.set(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        );
    }
}

function buildContentSecurityPolicy(request: NextRequest): string {
    const secureRequest = isSecureRequest(request);
    const nonce = createNonce();
    const scriptSrc = ["'self'", `'nonce-${nonce}'`].join(" ");
    const csp: string[] = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ];

    if (secureRequest) {
        csp.push("upgrade-insecure-requests");
    }

    return csp.join("; ");
}

const authMiddleware = convexAuthNextjsMiddleware((request) => {
    const requestHeaders = new Headers(request.headers);
    const cspValue = isProduction ? buildContentSecurityPolicy(request) : null;

    if (cspValue) {
        // Next.js App Router can automatically nonce its own inline scripts if it can
        // extract a nonce from the request CSP header.
        requestHeaders.set("content-security-policy", cspValue);
    }

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    if (!isProduction) {
        return response;
    }

    const secureRequest = isSecureRequest(request);
    applyCommonSecurityHeaders(response, { secureRequest });
    if (cspValue) {
        response.headers.set("Content-Security-Policy", cspValue);
    }

    return response;
});

export function proxy(request: NextRequest, event: NextFetchEvent) {
    return authMiddleware(request, event);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
