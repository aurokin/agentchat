import {
    buildInterruptCommand,
    prepareConversationSend,
    type ActiveRunState,
    type RetryChatState,
    type RuntimeErrorState,
    type StreamingMessageState,
} from "@shared/core/conversation-runtime";
import type { ProviderModel } from "@shared/core/models";
import type { ChatSession, Message } from "@shared/core/types";
import type { ConversationSendCommand } from "@/lib/agentchat-socket";
import { v4 as uuidv4 } from "uuid";

type MobileMessageUpdate = Message;

export type MobileConversationSendDependencies = {
    addMessage: (
        message: Omit<Message, "createdAt" | "id"> & { id?: string },
    ) => Promise<Message>;
    updateMessage: (message: Message) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void>;
    setDefaultModel: (modelId: string) => void;
    queueStreamingMessageUpdate: (
        update: StreamingMessageState | null,
    ) => void | Promise<void>;
    ensureConnected: () => Promise<void>;
    sendCommand: (command: ConversationSendCommand) => void;
};

export type MobileConversationSendResult =
    | {
          status: "sent";
          activeRun: ActiveRunState;
      }
    | {
          status: "failed";
          error: RuntimeErrorState;
          retryChat: RetryChatState;
          assistantMessageId: string | null;
      };

export async function runMobileConversationSend(params: {
    chat: ChatSession;
    messages: Message[];
    models: ProviderModel[];
    content: string;
    dependencies: MobileConversationSendDependencies;
}): Promise<MobileConversationSendResult> {
    let assistantMessage: MobileMessageUpdate | null = null;

    try {
        const sendPlan = prepareConversationSend({
            chat: params.chat,
            messages: params.messages,
            models: params.models,
            content: params.content,
            createId: uuidv4,
        });

        await params.dependencies.addMessage({
            id: sendPlan.userMessage.id,
            sessionId: params.chat.id,
            role: "user",
            content: sendPlan.userMessage.content,
            contextContent: sendPlan.userMessage.contextContent,
            status: "completed",
            runId: null,
            modelId: sendPlan.userMessage.modelId,
            variantId: sendPlan.userMessage.variantId ?? null,
            reasoningEffort: sendPlan.userMessage.reasoningEffort,
            completedAt: Date.now(),
        });

        params.dependencies.setDefaultModel(params.chat.modelId);

        if (
            sendPlan.titleUpdate ||
            params.chat.settingsLockedAt === null ||
            params.chat.settingsLockedAt === undefined
        ) {
            await params.dependencies.updateChat({
                ...(sendPlan.titleUpdate ?? params.chat),
                settingsLockedAt: params.chat.settingsLockedAt ?? Date.now(),
            });
        }

        assistantMessage = await params.dependencies.addMessage({
            id: sendPlan.assistantMessage.id,
            sessionId: params.chat.id,
            role: "assistant",
            content: "",
            contextContent: "",
            status: "draft",
            runId: null,
            modelId: sendPlan.assistantMessage.modelId,
            variantId: sendPlan.assistantMessage.variantId ?? null,
            reasoningEffort: sendPlan.assistantMessage.reasoningEffort,
            reasoning: undefined,
            completedAt: null,
        });

        await params.dependencies.queueStreamingMessageUpdate({
            id: sendPlan.assistantMessage.id,
            content: "",
            reasoning: undefined,
        });

        await params.dependencies.ensureConnected();
        params.dependencies.sendCommand(sendPlan.command);

        return {
            status: "sent",
            activeRun: sendPlan.activeRun,
        };
    } catch (sendError) {
        if (assistantMessage) {
            try {
                await params.dependencies.updateMessage({
                    ...assistantMessage,
                    status: "errored",
                    updatedAt: Date.now(),
                    completedAt: Date.now(),
                });
            } catch {
                // Preserve original send error.
            }
        }

        return {
            status: "failed",
            assistantMessageId: assistantMessage?.id ?? null,
            error: {
                message:
                    sendError instanceof Error
                        ? sendError.message
                        : "Failed to send message",
                isRetryable: true,
            },
            retryChat: {
                content: params.content,
                contextContent: params.content,
            },
        };
    }
}

export function interruptMobileConversationRun(params: {
    activeRun: ActiveRunState | null;
    sendCommand: (command: ReturnType<typeof buildInterruptCommand>) => void;
}): RuntimeErrorState | null {
    if (!params.activeRun) {
        return null;
    }

    try {
        params.sendCommand(
            buildInterruptCommand(params.activeRun.conversationId, uuidv4),
        );
        return null;
    } catch (cancelError) {
        return {
            message:
                cancelError instanceof Error
                    ? cancelError.message
                    : "Failed to interrupt the active run",
            isRetryable: true,
        };
    }
}
