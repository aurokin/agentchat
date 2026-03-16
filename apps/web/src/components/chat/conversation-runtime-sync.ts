import { shouldClearPendingReconnectNoticeAfterRuntimeSync } from "@shared/core/conversation-runtime";
import type { ConversationRuntimeState } from "@/lib/types";
import type { RuntimeSyncResolution } from "./conversation-runtime-controller";

export function shouldClearPendingReconnectNoticeAfterSync(params: {
    syncResolution: RuntimeSyncResolution;
    runtimeState: ConversationRuntimeState;
}): boolean {
    return shouldClearPendingReconnectNoticeAfterRuntimeSync({
        shouldReset: params.syncResolution.shouldReset,
        recoveredRun: params.syncResolution.recoveredRun,
        runtimeState: params.runtimeState,
    });
}
