import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isDevelopment = process.env.NODE_ENV === "development";

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

export function middleware(_request: NextRequest) {
    if (process.env.DISABLE_CSP?.toLowerCase() === "true") {
        return NextResponse.next();
    }

    const nonce = createNonce();

    const scriptSrc = [
        "'self'",
        `'nonce-${nonce}'`,
        // Next dev tooling may require eval for source maps/HMR.
        isDevelopment ? "'unsafe-eval'" : null,
    ]
        .filter(Boolean)
        .join(" ");

    const csp: string[] = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss: ws:",
        "base-uri 'none'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
    ];

    if (!isDevelopment) {
        csp.push("upgrade-insecure-requests");
    }

    // Next.js App Router can automatically nonce its own inline scripts if it can
    // extract a nonce from the *request* CSP header. So we set CSP on both the
    // request (for Next) and response (for the browser).
    const requestHeaders = new Headers(_request.headers);
    requestHeaders.set("content-security-policy", csp.join("; "));

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
    response.headers.set("Content-Security-Policy", csp.join("; "));
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
