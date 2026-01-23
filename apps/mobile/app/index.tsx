import React, { useEffect } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useChatContext } from "../src/contexts/ChatContext";
import { useAppContext } from "../src/contexts/AppContext";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen(): React.ReactElement {
    const router = useRouter();
    const { chats, isLoading, error, loadChats, createChat, deleteChat } =
        useChatContext();
    const { isInitialized } = useAppContext();

    useEffect(() => {
        if (isInitialized) {
            loadChats();
        }
    }, [isInitialized, loadChats]);

    const handleCreateChat = async () => {
        const chat = await createChat();
        router.push(`/chat/${chat.id}`);
    };

    const handleSelectChat = async (chatId: string) => {
        router.push(`/chat/${chatId}`);
    };

    const handleDeleteChat = async (chatId: string) => {
        await deleteChat(chatId);
    };

    const formatDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor(
            (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 0) {
            return date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        } else if (diffDays === 1) {
            return "Yesterday";
        } else if (diffDays < 7) {
            return date.toLocaleDateString([], { weekday: "short" });
        } else {
            return date.toLocaleDateString([], {
                month: "short",
                day: "numeric",
            });
        }
    };

    if (!isInitialized) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.container, styles.centerContent]}>
                    <ActivityIndicator size="large" />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>RouterChat</Text>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => router.push("/settings")}
                >
                    <Text style={styles.settingsButtonText}>Settings</Text>
                </TouchableOpacity>
            </View>

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {isLoading && chats.length === 0 ? (
                <View style={[styles.container, styles.centerContent]}>
                    <ActivityIndicator size="large" />
                </View>
            ) : chats.length === 0 ? (
                <View style={[styles.container, styles.centerContent]}>
                    <Text style={styles.emptyTitle}>No chats yet</Text>
                    <Text style={styles.emptySubtitle}>
                        Start a conversation to get started
                    </Text>
                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={handleCreateChat}
                    >
                        <Text style={styles.createButtonText}>New Chat</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={chats}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.chatItem}
                            onPress={() => handleSelectChat(item.id)}
                            onLongPress={() => handleDeleteChat(item.id)}
                        >
                            <View style={styles.chatItemContent}>
                                <Text
                                    style={styles.chatTitle}
                                    numberOfLines={1}
                                >
                                    {item.title}
                                </Text>
                                <Text style={styles.chatDate}>
                                    {formatDate(item.updatedAt)}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    contentContainerStyle={styles.listContent}
                    refreshing={isLoading}
                    onRefresh={loadChats}
                />
            )}

            {chats.length > 0 && (
                <TouchableOpacity style={styles.fab} onPress={handleCreateChat}>
                    <Text style={styles.fabText}>+</Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    centerContent: {
        justifyContent: "center",
        alignItems: "center",
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    title: {
        fontSize: 20,
        fontWeight: "bold",
    },
    settingsButton: {
        padding: 8,
    },
    settingsButtonText: {
        fontSize: 16,
        color: "#007AFF",
    },
    loadingText: {
        marginTop: 12,
        color: "#666",
    },
    errorContainer: {
        backgroundColor: "#FFEBEE",
        padding: 12,
        marginHorizontal: 16,
        marginTop: 8,
        borderRadius: 8,
    },
    errorText: {
        color: "#C62828",
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: "600",
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 16,
        color: "#666",
        marginBottom: 24,
    },
    createButton: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    createButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    listContent: {
        padding: 16,
    },
    chatItem: {
        backgroundColor: "#f8f8f8",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    chatItemContent: {
        flex: 1,
    },
    chatTitle: {
        fontSize: 16,
        fontWeight: "500",
        marginBottom: 4,
    },
    chatDate: {
        fontSize: 12,
        color: "#888",
    },
    fab: {
        position: "absolute",
        bottom: 24,
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "#007AFF",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    fabText: {
        fontSize: 28,
        color: "#fff",
        marginTop: -2,
    },
});
