export interface ConversationHistoryEntry {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ConversationSendCommand {
    id: string;
    type: "conversation.send";
    payload: {
        conversationId: string;
        agentId: string;
        modelId: string;
        variantId?: string | null;
        thinking: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
        content: string;
        userMessageId: string;
        assistantMessageId: string;
        history: ConversationHistoryEntry[];
    };
}

export interface ConversationInterruptCommand {
    id: string;
    type: "conversation.interrupt";
    payload: {
        conversationId: string;
    };
}

export interface ConversationSubscribeCommand {
    id: string;
    type: "conversation.subscribe" | "conversation.unsubscribe";
    payload: {
        conversationId: string;
    };
}

export type ClientCommand =
    | ConversationSendCommand
    | ConversationInterruptCommand
    | ConversationSubscribeCommand;

export interface ServerEvent {
    type:
        | "connection.ready"
        | "connection.error"
        | "run.started"
        | "run.completed"
        | "run.failed"
        | "run.interrupted"
        | "message.delta"
        | "message.completed";
    payload: Record<string, unknown>;
}

function isHistoryEntry(value: unknown): value is ConversationHistoryEntry {
    if (!value || typeof value !== "object") {
        return false;
    }

    const entry = value as Partial<ConversationHistoryEntry>;
    return (
        (entry.role === "user" ||
            entry.role === "assistant" ||
            entry.role === "system") &&
        typeof entry.content === "string"
    );
}

export function parseClientCommand(raw: string): ClientCommand {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") {
        throw new Error("Invalid client command");
    }

    const command = value as {
        id?: unknown;
        type?: unknown;
        payload?: unknown;
    };

    if (typeof command.id !== "string" || typeof command.type !== "string") {
        throw new Error("Invalid client command envelope");
    }

    if (
        command.type === "conversation.subscribe" ||
        command.type === "conversation.unsubscribe"
    ) {
        const payload = command.payload as
            | ConversationSubscribeCommand["payload"]
            | undefined;
        if (!payload || typeof payload.conversationId !== "string") {
            throw new Error("Invalid conversation subscription payload");
        }

        return {
            id: command.id,
            type: command.type,
            payload,
        };
    }

    if (command.type === "conversation.interrupt") {
        const payload = command.payload as
            | ConversationInterruptCommand["payload"]
            | undefined;
        if (!payload || typeof payload.conversationId !== "string") {
            throw new Error("Invalid interrupt payload");
        }

        return {
            id: command.id,
            type: "conversation.interrupt",
            payload,
        };
    }

    if (command.type === "conversation.send") {
        const payload = command.payload as
            | ConversationSendCommand["payload"]
            | undefined;
        if (
            !payload ||
            typeof payload.conversationId !== "string" ||
            typeof payload.agentId !== "string" ||
            typeof payload.modelId !== "string" ||
            (payload.variantId !== undefined &&
                payload.variantId !== null &&
                typeof payload.variantId !== "string") ||
            typeof payload.content !== "string" ||
            typeof payload.userMessageId !== "string" ||
            typeof payload.assistantMessageId !== "string" ||
            !Array.isArray(payload.history) ||
            !payload.history.every(isHistoryEntry)
        ) {
            throw new Error("Invalid send payload");
        }

        if (
            payload.thinking !== "xhigh" &&
            payload.thinking !== "high" &&
            payload.thinking !== "medium" &&
            payload.thinking !== "low" &&
            payload.thinking !== "minimal" &&
            payload.thinking !== "none"
        ) {
            throw new Error("Invalid thinking level");
        }

        return {
            id: command.id,
            type: "conversation.send",
            payload,
        };
    }

    throw new Error(`Unsupported command type: ${command.type}`);
}
