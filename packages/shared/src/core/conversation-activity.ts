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
    activity:
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
}): ConversationActivityState {
    if (!params.activity) {
        return null;
    }

    if (params.isActiveConversation && params.activity.label === "New reply") {
        return null;
    }

    return params.activity;
}
