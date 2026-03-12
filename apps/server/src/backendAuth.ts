import {
    verifyBackendSessionToken,
    type BackendSessionClaims,
} from "../../../packages/shared/src/core/backend-token";

function getSecret(): string {
    const secret = process.env.BACKEND_TOKEN_SECRET?.trim();
    if (!secret) {
        throw new Error("BACKEND_TOKEN_SECRET is not configured.");
    }
    return secret;
}

export function getBackendTokenFromRequest(request: Request): string | null {
    const authorization = request.headers.get("authorization")?.trim();
    if (authorization?.toLowerCase().startsWith("bearer ")) {
        return authorization.slice("bearer ".length).trim() || null;
    }

    const url = new URL(request.url);
    return url.searchParams.get("token");
}

export async function authenticateBackendRequest(
    request: Request,
): Promise<BackendSessionClaims> {
    const token = getBackendTokenFromRequest(request);
    if (!token) {
        throw new Error("Missing backend session token");
    }

    return await verifyBackendSessionToken({
        token,
        secret: getSecret(),
    });
}

export function toConnectionReadyEvent(session: BackendSessionClaims) {
    return JSON.stringify({
        type: "connection.ready",
        payload: {
            user: {
                sub: session.sub,
                userId: session.userId,
                email: session.email,
            },
            transport: "websocket",
        },
    });
}
