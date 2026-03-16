import {
    deriveConversationRuntimeState as deriveSharedConversationRuntimeState,
    type ChatRunSummaryLike,
    type ConversationRuntimeStateLike,
    type RuntimeBindingSummaryLike,
} from "@shared/core/conversation-runtime-state";
import type { Message } from "@shared/core/types";

import type {
    ChatRunSummary,
    ConversationRuntimeState,
    RuntimeBindingSummary,
} from "@/lib/types";

export function deriveConversationRuntimeState(params: {
    messages: Message[];
    runSummaries: ChatRunSummary[];
    runtimeBinding?: RuntimeBindingSummary | null;
}): ConversationRuntimeState {
    return deriveSharedConversationRuntimeState({
        messages: params.messages,
        runSummaries: params.runSummaries as ChatRunSummaryLike[],
        runtimeBinding: params.runtimeBinding as RuntimeBindingSummaryLike | null,
    }) as ConversationRuntimeStateLike as ConversationRuntimeState;
}
