export interface BackendSessionClaims {
    sub: string;
    userId: string;
    email: string;
    exp: number;
    iat: number;
}

function encodeBase64Url(value: Uint8Array): string {
    return Buffer.from(value)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): ArrayBuffer {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
        normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
        "=",
    );
    return Uint8Array.from(Buffer.from(padded, "base64")).buffer;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

function assertClaimsShape(value: unknown): BackendSessionClaims {
    if (!value || typeof value !== "object") {
        throw new Error("Invalid backend token payload");
    }

    const claims = value as Partial<BackendSessionClaims>;
    if (
        typeof claims.sub !== "string" ||
        typeof claims.userId !== "string" ||
        typeof claims.email !== "string" ||
        typeof claims.exp !== "number" ||
        typeof claims.iat !== "number"
    ) {
        throw new Error("Invalid backend token payload");
    }

    return {
        sub: claims.sub,
        userId: claims.userId,
        email: claims.email,
        exp: claims.exp,
        iat: claims.iat,
    };
}

export async function createBackendSessionToken(params: {
    claims: BackendSessionClaims;
    secret: string;
}): Promise<string> {
    const { claims, secret } = params;
    const header = {
        alg: "HS256",
        typ: "JWT",
    };

    const encodedHeader = encodeBase64Url(
        new TextEncoder().encode(JSON.stringify(header)),
    );
    const encodedPayload = encodeBase64Url(
        new TextEncoder().encode(JSON.stringify(claims)),
    );
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await importSigningKey(secret);
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(signingInput),
    );

    return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBackendSessionToken(params: {
    token: string;
    secret: string;
    nowSeconds?: number;
}): Promise<BackendSessionClaims> {
    const {
        token,
        secret,
        nowSeconds = Math.floor(Date.now() / 1000),
    } = params;
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
        throw new Error("Invalid backend token");
    }

    const key = await importSigningKey(secret);
    const isValid = await crypto.subtle.verify(
        "HMAC",
        key,
        decodeBase64Url(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );

    if (!isValid) {
        throw new Error("Invalid backend token signature");
    }

    const claims = assertClaimsShape(
        JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))),
    );

    if (claims.exp <= nowSeconds) {
        throw new Error("Backend token expired");
    }

    return claims;
}
