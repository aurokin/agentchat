import { ClaudeCodeRuntimeKind } from "./claudeCodeRuntimeKind.ts";
import { CodexRuntimeKind } from "./codexRuntimeKind.ts";
import type { RuntimeKind, RuntimeKindId } from "./runtimeKind.ts";

export class RuntimeKindRegistry {
    private readonly kinds: Map<RuntimeKindId, RuntimeKind>;

    constructor(kinds: RuntimeKind[]) {
        this.kinds = new Map(kinds.map((kind) => [kind.kind, kind]));
    }

    static default(): RuntimeKindRegistry {
        return new RuntimeKindRegistry([
            new CodexRuntimeKind(),
            new ClaudeCodeRuntimeKind(),
        ]);
    }

    get(kind: RuntimeKindId): RuntimeKind {
        const runtimeKind = this.kinds.get(kind);
        if (!runtimeKind) {
            throw new Error(`Runtime kind '${kind}' is not registered.`);
        }
        return runtimeKind;
    }
}

export function runtimeKindRegistryFromSingleKind(
    runtimeKind: RuntimeKind,
): RuntimeKindRegistry {
    return new RuntimeKindRegistry([runtimeKind]);
}
