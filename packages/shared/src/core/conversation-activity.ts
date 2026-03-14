export type ConversationActivityState =
    | {
          label: "Working";
          tone: "working";
      }
    | {
          label: "New reply";
          tone: "completed";
      }
    | {
          label: "Needs attention";
          tone: "errored";
      }
    | null;

export function resolveConversationActivityState(params: {
    isActiveConversation: boolean;
    runtimeBinding: {
        status: "idle" | "active" | "expired" | "errored";
        lastEventAt: number | null;
    } | null;
    lastViewedAt: number | null;
}): ConversationActivityState {
    if (params.runtimeBinding?.status === "active") {
        return {
            label: "Working",
            tone: "working",
        };
    }

    if (params.runtimeBinding?.status === "errored") {
        return {
            label: "Needs attention",
            tone: "errored",
        };
    }

    if (
        !params.runtimeBinding ||
        params.isActiveConversation ||
        params.runtimeBinding.lastEventAt === null
    ) {
        return null;
    }

    if (
        params.lastViewedAt === null ||
        params.runtimeBinding.lastEventAt > params.lastViewedAt
    ) {
        return {
            label: "New reply",
            tone: "completed",
        };
    }

    return null;
}
