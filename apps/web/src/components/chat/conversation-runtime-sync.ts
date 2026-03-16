import { isConversationRuntimeSnapshotLive } from "@shared/core/conversation-runtime";
import type { ConversationRuntimeState } from "@/lib/types";
import type { RuntimeSyncResolution } from "./conversation-runtime-controller";

export function shouldClearPendingReconnectNoticeAfterSync(params: {
    syncResolution: RuntimeSyncResolution;
    runtimeState: ConversationRuntimeState;
}): boolean {
    if (params.syncResolution.recoveredRun) {
        return true;
    }

    return (
        !params.syncResolution.shouldReset &&
        !isConversationRuntimeSnapshotLive(params.runtimeState)
    );
}
