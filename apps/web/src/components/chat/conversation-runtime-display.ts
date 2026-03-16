import type { ConversationRuntimeState } from "@/lib/types";

export function resolveDisplayedRuntimeState(params: {
    runtimeState: ConversationRuntimeState;
    recoveredRunNotice: boolean;
}): ConversationRuntimeState {
    if (params.recoveredRunNotice && params.runtimeState.phase === "active") {
        return {
            ...params.runtimeState,
            phase: "recovering",
        };
    }

    return params.runtimeState;
}
