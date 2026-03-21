import { parseClientCommand, type ServerEvent } from "./socketProtocol.ts";

export type BackendSession = {
    sub: string;
    userId: string;
    email: string;
    iat: number;
    exp: number;
};

export type RuntimeManagerLike = {
    subscribe(params: {
        userId: string;
        conversationId: string;
        agentId?: string;
        subscriberId: string;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void> | void;
    unsubscribe(params: {
        subscriberId: string;
        conversationId?: string;
        agentId?: string;
    }): void;
    interrupt(params: {
        userId: string;
        conversationId: string;
        agentId?: string;
    }): Promise<void>;
    sendMessage(params: {
        userId: string;
        subscriberId: string;
        command: Extract<
            ReturnType<typeof parseClientCommand>,
            { type: "conversation.send" }
        >;
        sendEvent: (event: ServerEvent) => void;
    }): Promise<void>;
    deleteConversationWorkspace(params: {
        userId: string;
        conversationId: string;
        agentId: string;
        chatId?: string;
    }): Promise<void>;
};

function toServerEventJson(event: ServerEvent): string {
    return JSON.stringify(event);
}

export function toConnectionErrorEvent(message: string): string {
    return toServerEventJson({
        type: "connection.error",
        payload: { message },
    });
}

export function normalizeSocketMessage(
    message: string | Buffer | ArrayBuffer | Uint8Array,
): string {
    if (typeof message === "string") {
        return message;
    }

    if (message instanceof ArrayBuffer) {
        return new TextDecoder().decode(new Uint8Array(message));
    }

    if (ArrayBuffer.isView(message)) {
        return new TextDecoder().decode(
            new Uint8Array(
                message.buffer,
                message.byteOffset,
                message.byteLength,
            ),
        );
    }

    throw new Error("Unsupported websocket message type");
}

export async function handleConnectedSocketMessage(params: {
    runtimeManager: RuntimeManagerLike;
    session: BackendSession;
    connectionId: string;
    rawMessage: string | Buffer | ArrayBuffer | Uint8Array;
    sendJson: (payload: string) => void;
}): Promise<void> {
    let commandText: string;
    try {
        commandText = normalizeSocketMessage(params.rawMessage);
    } catch (error) {
        params.sendJson(
            toConnectionErrorEvent(
                error instanceof Error
                    ? error.message
                    : "Invalid websocket message",
            ),
        );
        return;
    }

    try {
        const command = parseClientCommand(commandText);
        const sendEvent = (event: ServerEvent) => {
            params.sendJson(toServerEventJson(event));
        };

        if (command.type === "conversation.subscribe") {
            await params.runtimeManager.subscribe({
                userId: params.session.userId,
                conversationId: command.payload.conversationId,
                agentId: command.payload.agentId,
                subscriberId: params.connectionId,
                sendEvent,
            });
            return;
        }

        if (command.type === "conversation.unsubscribe") {
            params.runtimeManager.unsubscribe({
                subscriberId: params.connectionId,
                conversationId: command.payload.conversationId,
                agentId: command.payload.agentId,
            });
            return;
        }

        if (command.type === "conversation.interrupt") {
            await params.runtimeManager.interrupt({
                userId: params.session.userId,
                conversationId: command.payload.conversationId,
                agentId: command.payload.agentId,
            });
            return;
        }

        if (command.type === "conversation.delete") {
            await params.runtimeManager.deleteConversationWorkspace({
                userId: params.session.userId,
                conversationId: command.payload.conversationId,
                agentId: command.payload.agentId,
                chatId: command.payload.chatId,
            });
            return;
        }

        if (command.type !== "conversation.send") {
            throw new Error("Unsupported websocket command");
        }

        await params.runtimeManager.sendMessage({
            userId: params.session.userId,
            subscriberId: params.connectionId,
            command,
            sendEvent,
        });
    } catch (error) {
        params.sendJson(
            toConnectionErrorEvent(
                error instanceof Error
                    ? error.message
                    : "Failed to process websocket command",
            ),
        );
    }
}

export function handleSocketClose(params: {
    runtimeManager: RuntimeManagerLike;
    connectionId: string;
}): void {
    params.runtimeManager.unsubscribe({
        subscriberId: params.connectionId,
    });
}
