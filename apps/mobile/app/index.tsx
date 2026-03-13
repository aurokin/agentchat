import React, {
    useEffect,
    useMemo,
    useState,
    useCallback,
    useRef,
} from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    useWindowDimensions,
    type LayoutChangeEvent,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useChatContext } from "@/contexts/ChatContext";
import { useAppContext } from "@/contexts/AppContext";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { useAgent } from "@/contexts/AgentContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { getMessageCountByChat } from "@/lib/db/operations";
import { AgentSwitcher } from "@/components/chat/AgentSwitcher";

export default function HomeScreen(): React.ReactElement {
    const router = useRouter();
    const { chats, isLoading, error, loadChats, createChat, deleteChats } =
        useChatContext();
    const { isInitialized } = useAppContext();
    const { selectedAgent } = useAgent();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(
        new Set(),
    );
    const longPressTriggeredRef = useRef(false);
    const [headerHeight, setHeaderHeight] = useState<number | null>(null);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const isTwoPaneLayout = Math.min(windowWidth, windowHeight) >= 700;

    useEffect(() => {
        if (isInitialized) {
            loadChats();
        }
    }, [isInitialized, loadChats]);

    useEffect(() => {
        if (!isInitialized || !isTwoPaneLayout) return;
        if (isLoading || chats.length === 0) return;
        router.replace(`/chat/${chats[0].id}`);
    }, [chats, isInitialized, isLoading, isTwoPaneLayout, router]);

    const handleCreateChat = async () => {
        const chat = await createChat();
        router.push(`/chat/${chat.id}`);
    };

    const handleSelectChat = async (chatId: string) => {
        router.push(`/chat/${chatId}`);
    };

    const clearSelection = useCallback(() => {
        setIsSelecting(false);
        setSelectedChatIds(new Set());
    }, []);

    const toggleChatSelection = useCallback((chatId: string) => {
        setSelectedChatIds((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
            } else {
                next.add(chatId);
            }
            if (next.size === 0) {
                setIsSelecting(false);
            }
            return next;
        });
    }, []);

    const handleChatPress = (chatId: string) => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }

        if (isSelecting) {
            toggleChatSelection(chatId);
            return;
        }

        void handleSelectChat(chatId);
    };

    const handleChatLongPress = (chatId: string) => {
        longPressTriggeredRef.current = true;
        if (!isSelecting) {
            setIsSelecting(true);
            setSelectedChatIds(new Set([chatId]));
            return;
        }

        toggleChatSelection(chatId);
    };

    const handleDeleteSelected = useCallback(async () => {
        if (selectedChatIds.size === 0) return;

        const chatIds = Array.from(selectedChatIds);
        const hasMessages = chatIds.some(
            (chatId) => getMessageCountByChat(chatId) > 0,
        );

        const performDelete = async () => {
            await deleteChats(chatIds);
            clearSelection();
        };

        if (hasMessages) {
            Alert.alert(
                "Delete Chats",
                `Delete ${chatIds.length} ${
                    chatIds.length === 1 ? "chat" : "chats"
                } and all attachments?`,
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => {
                            void performDelete();
                        },
                    },
                ],
            );
            return;
        }

        await performDelete();
    }, [selectedChatIds, deleteChats, clearSelection]);

    const handleHeaderLayout = useCallback(
        (event: LayoutChangeEvent) => {
            if (isSelecting) return;
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight !== headerHeight) {
                setHeaderHeight(nextHeight);
            }
        },
        [isSelecting, headerHeight],
    );

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
                    <ActivityIndicator size="large" color={colors.accent} />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View
                style={[
                    styles.header,
                    isSelecting && headerHeight
                        ? { height: headerHeight }
                        : null,
                ]}
                onLayout={handleHeaderLayout}
            >
                <Text
                    style={styles.title}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                >
                    {isSelecting
                        ? `${selectedChatIds.size} selected`
                        : (selectedAgent?.name ?? "Agentchat")}
                </Text>
                {isSelecting ? (
                    <View style={styles.selectionActions}>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Cancel selection"
                            style={styles.selectionButton}
                            onPress={clearSelection}
                        >
                            <Text
                                style={styles.selectionButtonText}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                            >
                                Cancel
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${selectedChatIds.size} chats`}
                            style={[
                                styles.selectionButton,
                                styles.deleteAction,
                            ]}
                            onPress={handleDeleteSelected}
                        >
                            <Feather
                                name="trash-2"
                                size={16}
                                color={colors.danger}
                            />
                            <Text
                                style={[
                                    styles.selectionButtonText,
                                    styles.deleteActionText,
                                ]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                            >
                                Delete ({selectedChatIds.size})
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.headerActions}>
                        <AgentSwitcher compact />
                        <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Settings"
                            style={styles.settingsButton}
                            onPress={() => router.push("/settings")}
                        >
                            <Feather
                                name="settings"
                                size={22}
                                color={colors.accent}
                            />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {isLoading && chats.length === 0 ? (
                <View style={[styles.container, styles.centerContent]}>
                    <ActivityIndicator size="large" color={colors.accent} />
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
                    renderItem={({ item }) => {
                        const isSelected = selectedChatIds.has(item.id);
                        return (
                            <TouchableOpacity
                                style={[
                                    styles.chatItem,
                                    isSelected && styles.chatItemSelected,
                                ]}
                                onPress={() => handleChatPress(item.id)}
                                onLongPress={() => handleChatLongPress(item.id)}
                                onPressOut={() => {
                                    longPressTriggeredRef.current = false;
                                }}
                            >
                                <View style={styles.chatItemRow}>
                                    {isSelecting && (
                                        <View style={styles.selectionIndicator}>
                                            <Feather
                                                name={
                                                    isSelected
                                                        ? "check-circle"
                                                        : "circle"
                                                }
                                                size={20}
                                                color={
                                                    isSelected
                                                        ? colors.accent
                                                        : colors.textSubtle
                                                }
                                            />
                                        </View>
                                    )}
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
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                    contentContainerStyle={styles.listContent}
                    refreshing={isLoading}
                    onRefresh={loadChats}
                />
            )}

            {chats.length > 0 && !isSelecting && (
                <TouchableOpacity style={styles.fab} onPress={handleCreateChat}>
                    <Text style={styles.fabText}>+</Text>
                </TouchableOpacity>
            )}
        </SafeAreaView>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
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
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
        },
        title: {
            fontSize: 20,
            fontWeight: "bold",
            color: colors.text,
            flexShrink: 1,
            marginRight: 12,
        },
        settingsButton: {
            padding: 8,
        },
        headerActions: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        selectionActions: {
            flexDirection: "row",
            alignItems: "center",
        },
        selectionButton: {
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        selectionButtonText: {
            color: colors.textMuted,
            fontSize: 14,
            fontWeight: "600",
        },
        deleteAction: {
            marginLeft: 8,
            borderColor: colors.danger,
            backgroundColor: colors.dangerSoft,
            flexDirection: "row",
            alignItems: "center",
        },
        deleteActionText: {
            marginLeft: 6,
            color: colors.danger,
        },
        loadingText: {
            marginTop: 12,
            color: colors.textMuted,
        },
        errorContainer: {
            backgroundColor: colors.dangerSoft,
            padding: 12,
            marginHorizontal: 16,
            marginTop: 8,
            borderRadius: 8,
        },
        errorText: {
            color: colors.danger,
        },
        emptyTitle: {
            fontSize: 20,
            fontWeight: "600",
            marginBottom: 8,
            color: colors.text,
        },
        emptySubtitle: {
            fontSize: 16,
            color: colors.textMuted,
            marginBottom: 24,
        },
        createButton: {
            backgroundColor: colors.accent,
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 8,
        },
        createButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        listContent: {
            padding: 16,
        },
        chatItem: {
            backgroundColor: colors.surfaceMuted,
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
        },
        chatItemSelected: {
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
        },
        chatItemRow: {
            flexDirection: "row",
            alignItems: "center",
        },
        selectionIndicator: {
            width: 24,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
        },
        chatItemContent: {
            flex: 1,
        },
        chatTitle: {
            fontSize: 16,
            fontWeight: "500",
            marginBottom: 4,
            color: colors.text,
        },
        chatDate: {
            fontSize: 12,
            color: colors.textSubtle,
        },
        fab: {
            position: "absolute",
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accent,
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
            color: colors.textOnAccent,
            marginTop: -2,
        },
    });
