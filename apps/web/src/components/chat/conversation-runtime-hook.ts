import type { ConversationRuntimeState } from "@/lib/types";
import type { ActiveRunState } from "./conversation-runtime-helpers";
import type { RuntimeSyncResolution } from "./conversation-runtime-controller";
import { shouldClearPendingReconnectNoticeAfterSync } from "./conversation-runtime-sync";

export type ConversationRuntimeSyncPlan = {
    shouldReset: boolean;
    recoveredRun: ActiveRunState | null;
    recoveredRunNotice: boolean | null;
    clearPendingReconnectNotice: boolean;
};

export function planConversationRuntimeSync(params: {
    syncResolution: RuntimeSyncResolution;
    runtimeState: ConversationRuntimeState;
    pendingReconnectNotice: boolean;
}): ConversationRuntimeSyncPlan {
    const clearPendingReconnectNotice =
        shouldClearPendingReconnectNoticeAfterSync({
            syncResolution: params.syncResolution,
            runtimeState: params.runtimeState,
        });

    return {
        shouldReset: params.syncResolution.shouldReset,
        recoveredRun: params.syncResolution.recoveredRun,
        recoveredRunNotice: params.syncResolution.recoveredRun
            ? params.pendingReconnectNotice
            : null,
        clearPendingReconnectNotice,
    };
}
