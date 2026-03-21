import type { ChatSession, Message } from "../types";

export type { WorkspaceStatus } from "./types";
export {
    isReasoningEffort,
    toReasoningEffort,
    mergeByIdWithPending,
    mapConvexChatToSession,
    mapConvexMessageToMessage,
} from "./workspace-helpers";

export interface PersistenceAdapter {
    createChat(chat: ChatSession): Promise<string>;
    getChat(id: string, agentId?: string): Promise<ChatSession | undefined>;
    getAllChats(): Promise<ChatSession[]>;
    updateChat(chat: ChatSession): Promise<void>;
    markChatViewed(
        chatId: string,
        timestamp: number,
        agentId?: string,
    ): Promise<void>;
    deleteChat(id: string, agentId?: string): Promise<string | null>;
    createMessage(message: Message, agentId?: string): Promise<string>;
    updateMessage(message: Message): Promise<void>;
    getMessagesByChat(chatId: string, agentId?: string): Promise<Message[]>;
    deleteMessagesByChat(chatId: string, agentId?: string): Promise<void>;
    deleteMessage(id: string): Promise<void>;
}

export type PersistenceAdapterFactory = () => PersistenceAdapter;
