import { shouldClearPendingReconnectNoticeAfterRuntimeSync } from "@shared/core/conversation-runtime";
import type { ConversationRuntimeState } from "@/lib/types";
import type { MobileRuntimeSyncResolution } from "./conversation-runtime-controller";

export type MobileConversationRuntimeSyncPlan = {
    shouldReset: boolean;
    recoveredRun: MobileRuntimeSyncResolution["recoveredRun"];
    recoveredRunNotice: boolean | null;
    clearPendingReconnectNotice: boolean;
};

export function planMobileConversationRuntimeSync(params: {
    syncResolution: MobileRuntimeSyncResolution;
    runtimeState: ConversationRuntimeState;
    pendingReconnectNotice: boolean;
}): MobileConversationRuntimeSyncPlan {
    const clearPendingReconnectNotice =
        shouldClearPendingReconnectNoticeAfterRuntimeSync({
            shouldReset: params.syncResolution.shouldReset,
            recoveredRun: params.syncResolution.recoveredRun,
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
