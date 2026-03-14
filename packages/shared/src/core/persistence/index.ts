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
    getChat(id: string): Promise<ChatSession | undefined>;
    getAllChats(): Promise<ChatSession[]>;
    updateChat(chat: ChatSession): Promise<void>;
    deleteChat(id: string): Promise<void>;
    createMessage(message: Message): Promise<string>;
    updateMessage(message: Message): Promise<void>;
    getMessagesByChat(chatId: string): Promise<Message[]>;
    deleteMessagesByChat(chatId: string): Promise<void>;
    deleteMessage(id: string): Promise<void>;
}

export type PersistenceAdapterFactory = () => PersistenceAdapter;
