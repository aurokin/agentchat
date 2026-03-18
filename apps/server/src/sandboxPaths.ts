import path from "node:path";

export const UNSAFE_SEGMENT_PATTERN = /[/\\\0]|^\.\.?$/;
const WINDOWS_RESERVED_CHARACTER_PATTERN = /[<>:"|?*\u0000-\u001f]/;
const WINDOWS_RESERVED_NAME_PATTERN =
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_TRAILING_PATTERN = /[. ]$/;

export function isSafePathSegment(value: string): boolean {
    return (
        value.length > 0 &&
        !UNSAFE_SEGMENT_PATTERN.test(value) &&
        !WINDOWS_RESERVED_CHARACTER_PATTERN.test(value) &&
        !WINDOWS_RESERVED_NAME_PATTERN.test(value) &&
        !WINDOWS_TRAILING_PATTERN.test(value)
    );
}

export function assertSafePathSegment(label: string, value: string): void {
    if (!isSafePathSegment(value)) {
        throw new Error(
            `Unsafe ${label} for sandbox path: ${JSON.stringify(value)}`,
        );
    }
}

export function getSandboxUserPathSegment(userId: string): string {
    if (userId.length === 0) {
        throw new Error(
            `Unsafe userId for sandbox path: ${JSON.stringify(userId)}`,
        );
    }

    if (isSafePathSegment(userId)) {
        return userId;
    }

    return `~${Buffer.from(userId, "utf8").toString("base64url")}`;
}

export function getSandboxWorkspacePath(params: {
    sandboxRoot: string;
    agentId: string;
    userId: string;
    conversationId: string;
}): string {
    assertSafePathSegment("agentId", params.agentId);
    assertSafePathSegment("conversationId", params.conversationId);

    return path.join(
        path.resolve(params.sandboxRoot),
        params.agentId,
        getSandboxUserPathSegment(params.userId),
        params.conversationId,
    );
}
