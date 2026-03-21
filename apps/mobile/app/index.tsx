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
import { resolveConversationActivityState } from "@shared/core/conversation-activity";
import { useChatContext } from "@/contexts/ChatContext";
import { useAppContext } from "@/contexts/AppContext";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { AgentSwitcher } from "@/components/chat/AgentSwitcher";
import { getScopedChatStateKey } from "@/contexts/chat-state";
import {
    buildChatRouteId,
    getPreferredHomeChatRouteId,
} from "@/lib/home-chat-route";
import { resolveResponsiveLayout } from "@/lib/responsive-layout";

export default function HomeScreen(): React.ReactElement {
    const router = useRouter();
    const {
        chats,
        currentChat,
        conversationRuntimeBindings,
        isLoading,
        error,
        loadChats,
        createChat,
        deleteChats,
        hasMessagesInChats,
    } = useChatContext();
    const { isInitialized } = useAppContext();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedChatKeys, setSelectedChatKeys] = useState<Set<string>>(
        new Set(),
    );
    const longPressTriggeredRef = useRef(false);
    const [headerHeight, setHeaderHeight] = useState<number | null>(null);
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const { useTabletLandscapeLayout } = resolveResponsiveLayout({
        width: windowWidth,
        height: windowHeight,
    });
    const availableChatKeys = useMemo(
        () =>
            new Set(
                chats.map((chat) =>
                    getScopedChatStateKey(chat.id, chat.agentId),
                ),
            ),
        [chats],
    );
    const effectiveSelectedChatKeys = useMemo(
        () =>
            new Set(
                Array.from(selectedChatKeys).filter((key) =>
                    availableChatKeys.has(key),
                ),
            ),
        [availableChatKeys, selectedChatKeys],
    );
    const selectionMode = isSelecting && effectiveSelectedChatKeys.size > 0;

    useEffect(() => {
        if (isInitialized) {
            void loadChats();
        }
    }, [isInitialized, loadChats]);

    useEffect(() => {
        if (!isInitialized || !useTabletLandscapeLayout) return;
        if (isLoading || chats.length === 0) return;
        const preferredChatRouteId = getPreferredHomeChatRouteId({
            currentChatId: currentChat?.id ?? null,
            currentChatAgentId: currentChat?.agentId ?? null,
            chats,
        });
        if (!preferredChatRouteId) return;
        router.replace(`/chat/${preferredChatRouteId}`);
    }, [
        chats,
        currentChat?.agentId,
        currentChat?.id,
        isInitialized,
        isLoading,
        useTabletLandscapeLayout,
        router,
    ]);

    const handleCreateChat = async () => {
        const chat = await createChat();
        router.push(
            `/chat/${buildChatRouteId({
                chatId: chat.id,
                agentId: chat.agentId,
            })}`,
        );
    };

    const handleSelectChat = async (chatId: string, agentId: string) => {
        router.push(
            `/chat/${buildChatRouteId({
                chatId,
                agentId,
            })}`,
        );
    };

    const clearSelection = useCallback(() => {
        setIsSelecting(false);
        setSelectedChatKeys(new Set());
    }, []);

    const toggleChatSelection = useCallback(
        (chatId: string, agentId: string) => {
            const chatKey = getScopedChatStateKey(chatId, agentId);
            setSelectedChatKeys((prev) => {
                const next = new Set(prev);
                if (next.has(chatKey)) {
                    next.delete(chatKey);
                } else {
                    next.add(chatKey);
                }
                if (next.size === 0) {
                    setIsSelecting(false);
                }
                return next;
            });
        },
        [],
    );

    const handleChatPress = (chatId: string, agentId: string) => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }

        if (selectionMode) {
            toggleChatSelection(chatId, agentId);
            return;
        }

        void handleSelectChat(chatId, agentId);
    };

    const handleChatLongPress = (chatId: string, agentId: string) => {
        const chatKey = getScopedChatStateKey(chatId, agentId);
        longPressTriggeredRef.current = true;
        if (!selectionMode) {
            setIsSelecting(true);
            setSelectedChatKeys(new Set([chatKey]));
            return;
        }

        toggleChatSelection(chatId, agentId);
    };

    const handleDeleteSelected = useCallback(async () => {
        if (effectiveSelectedChatKeys.size === 0) return;

        const selectedChats = chats.filter((chat) =>
            effectiveSelectedChatKeys.has(
                getScopedChatStateKey(chat.id, chat.agentId),
            ),
        );
        const chatIds = selectedChats.map((chat) => chat.id);
        const hasMessages = await hasMessagesInChats(chatIds);

        const performDelete = async () => {
            await deleteChats(chatIds);
            clearSelection();
        };

        if (hasMessages) {
            Alert.alert(
                "Delete Chats",
                `Delete ${chatIds.length} ${
                    chatIds.length === 1 ? "chat" : "chats"
                }?`,
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
    }, [
        effectiveSelectedChatKeys,
        chats,
        deleteChats,
        clearSelection,
        hasMessagesInChats,
    ]);

    const handleHeaderLayout = useCallback(
        (event: LayoutChangeEvent) => {
            if (selectionMode) return;
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight !== headerHeight) {
                setHeaderHeight(nextHeight);
            }
        },
        [selectionMode, headerHeight],
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
            {selectionMode ? (
                <View
                    style={[
                        styles.header,
                        headerHeight ? { height: headerHeight } : null,
                    ]}
                    onLayout={handleHeaderLayout}
                >
                    <Text
                        style={styles.title}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                    >
                        {effectiveSelectedChatKeys.size} selected
                    </Text>
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
                            accessibilityLabel={`Delete ${effectiveSelectedChatKeys.size} chats`}
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
                                Delete ({effectiveSelectedChatKeys.size})
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.listHeader}>
                    <View style={styles.listHeaderAgentSwitch}>
                        <AgentSwitcher compact />
                    </View>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Settings"
                        style={styles.settingsButton}
                        onPress={() => router.push("/settings")}
                    >
                        <Feather
                            name="settings"
                            size={20}
                            color={colors.accent}
                        />
                    </TouchableOpacity>
                </View>
            )}

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
                        const itemKey = getScopedChatStateKey(
                            item.id,
                            item.agentId,
                        );
                        const isSelected =
                            effectiveSelectedChatKeys.has(itemKey);
                        const activityState = resolveConversationActivityState({
                            isActiveConversation:
                                currentChat?.id === item.id &&
                                currentChat?.agentId === item.agentId,
                            activity:
                                conversationRuntimeBindings[
                                    getScopedChatStateKey(item.id, item.agentId)
                                ]?.activity ?? null,
                        });
                        return (
                            <TouchableOpacity
                                style={[
                                    styles.chatItem,
                                    isSelected && styles.chatItemSelected,
                                ]}
                                onPress={() =>
                                    handleChatPress(item.id, item.agentId)
                                }
                                onLongPress={() =>
                                    handleChatLongPress(item.id, item.agentId)
                                }
                                onPressOut={() => {
                                    longPressTriggeredRef.current = false;
                                }}
                            >
                                <View style={styles.chatItemRow}>
                                    {selectionMode && (
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
                                    <View style={styles.runtimeIndicator}>
                                        {activityState?.tone === "working" ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={colors.accent}
                                            />
                                        ) : activityState?.tone ===
                                          "errored" ? (
                                            <Feather
                                                name="alert-circle"
                                                size={18}
                                                color={colors.danger}
                                            />
                                        ) : activityState?.tone ===
                                          "completed" ? (
                                            <Feather
                                                name="corner-down-left"
                                                size={16}
                                                color={colors.accent}
                                            />
                                        ) : null}
                                    </View>
                                    <View style={styles.chatItemContent}>
                                        <Text
                                            style={styles.chatTitle}
                                            numberOfLines={1}
                                        >
                                            {item.title}
                                        </Text>
                                        <View style={styles.chatMetaRow}>
                                            <Text
                                                style={[
                                                    styles.chatDate,
                                                    activityState?.tone ===
                                                        "working" &&
                                                        styles.chatStateWorking,
                                                    activityState?.tone ===
                                                        "completed" &&
                                                        styles.chatStateCompleted,
                                                    activityState?.tone ===
                                                        "errored" &&
                                                        styles.chatStateErrored,
                                                ]}
                                            >
                                                {activityState?.label ??
                                                    formatDate(item.updatedAt)}
                                            </Text>
                                            {activityState?.label ? (
                                                <Text
                                                    style={
                                                        styles.chatMetaSeparator
                                                    }
                                                >
                                                    •
                                                </Text>
                                            ) : null}
                                            {activityState?.label ? (
                                                <Text style={styles.chatDate}>
                                                    {formatDate(item.updatedAt)}
                                                </Text>
                                            ) : null}
                                        </View>
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

            {chats.length > 0 && !selectionMode && (
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
        listHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
        },
        listHeaderAgentSwitch: {
            flex: 1,
            minWidth: 0,
        },
        title: {
            fontSize: 19,
            fontWeight: "700",
            color: colors.text,
            flexShrink: 1,
            marginRight: 12,
        },
        settingsButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
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
        runtimeIndicator: {
            width: 24,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
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
        chatMetaRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        chatDate: {
            fontSize: 12,
            color: colors.textSubtle,
        },
        chatMetaSeparator: {
            fontSize: 12,
            color: colors.textSubtle,
        },
        chatStateWorking: {
            color: colors.accent,
            fontWeight: "600",
        },
        chatStateCompleted: {
            color: colors.accent,
            fontWeight: "600",
        },
        chatStateErrored: {
            color: colors.danger,
            fontWeight: "600",
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
