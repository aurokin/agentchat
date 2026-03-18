import path from "node:path";

export const UNSAFE_SEGMENT_PATTERN = /[/\\\0]|^\.\.?$/;

export function isSafePathSegment(value: string): boolean {
    return value.length > 0 && !UNSAFE_SEGMENT_PATTERN.test(value);
}

export function assertSafePathSegment(label: string, value: string): void {
    if (!isSafePathSegment(value)) {
        throw new Error(
            `Unsafe ${label} for sandbox path: ${JSON.stringify(value)}`,
        );
    }
}

export function getSandboxWorkspacePath(params: {
    sandboxRoot: string;
    agentId: string;
    userId: string;
    conversationId: string;
}): string {
    assertSafePathSegment("agentId", params.agentId);
    assertSafePathSegment("userId", params.userId);
    assertSafePathSegment("conversationId", params.conversationId);

    return path.join(
        path.resolve(params.sandboxRoot),
        params.agentId,
        params.userId,
        params.conversationId,
    );
}
