import React, {
    useState,
    useMemo,
    useEffect,
    useRef,
    type ReactElement,
} from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Keyboard,
    Platform,
    Image,
    FlatList,
    ScrollView,
    useWindowDimensions,
} from "react-native";
import type { ProviderModel } from "@shared/core/models";
import type { ThinkingLevel } from "@shared/core/types";
import type { PendingAttachment } from "@shared/core/types";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { ThinkingToggle } from "@/components/chat/ThinkingToggle";
import { AttachmentPicker } from "@/components/chat/AttachmentPicker";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { modelSupportsVision } from "@/contexts/ModelContext";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { checkQuotaBeforeUpload } from "@/lib/storage";

interface MessageInputProps {
    inputText: string;
    onInputChange: (text: string) => void;
    onSend: () => void;
    isLoading: boolean;
    disabled?: boolean;
    models: ProviderModel[];
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    favoriteModels: string[];
    onToggleFavoriteModel: (modelId: string) => void;
    reasoningSupported: boolean;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    attachments: PendingAttachment[];
    onAttachmentsChange: (attachments: PendingAttachment[]) => void;
    onRemoveAttachment: (attachmentId: string) => void;
    sessionId?: string;
    onManageStorage?: () => void;
    onStartNewChat?: () => void;
}

interface QuotaWarning {
    title: string;
    message: string;
    reason: "total" | "session";
}

export function MessageInput({
    inputText,
    onInputChange,
    onSend,
    isLoading,
    disabled,
    models,
    selectedModelId,
    onModelChange,
    favoriteModels,
    onToggleFavoriteModel,
    reasoningSupported,
    thinkingLevel,
    onThinkingChange,
    attachments,
    onAttachmentsChange,
    onRemoveAttachment,
    sessionId,
    onManageStorage,
    onStartNewChat,
}: MessageInputProps): ReactElement {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [quotaWarning, setQuotaWarning] = useState<QuotaWarning | null>(null);
    const inputRef = useRef<TextInput>(null);
    const bottomPadding = isKeyboardVisible ? 8 : 8 + insets.bottom;
    const isTwoPaneLayout = Math.min(windowWidth, windowHeight) >= 700;
    const composerMaxWidth = Math.max(640, Math.min(980, windowWidth - 40));
    const composerConstraintStyle = isTwoPaneLayout
        ? {
              width: "100%" as const,
              maxWidth: composerMaxWidth,
              alignSelf: "center" as const,
          }
        : null;
    const styles = useMemo(
        () => createStyles(colors, bottomPadding),
        [colors, bottomPadding],
    );

    const pendingAttachmentBytes = useMemo(
        () => attachments.reduce((total, item) => total + (item.size || 0), 0),
        [attachments],
    );

    const canSend =
        (inputText.trim().length > 0 || attachments.length > 0) &&
        !disabled &&
        !isLoading &&
        !(quotaWarning && attachments.length > 0);
    const visionSupported = useMemo(() => {
        if (!selectedModelId) return false;
        return modelSupportsVision(selectedModelId, models);
    }, [selectedModelId, models]);

    useEffect(() => {
        const showEvent =
            Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
        const hideEvent =
            Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
        const showSubscription = Keyboard.addListener(showEvent, () => {
            setIsKeyboardVisible(true);
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setIsKeyboardVisible(false);
        });
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const checkQuota = async () => {
            const result = await checkQuotaBeforeUpload(
                pendingAttachmentBytes,
                sessionId,
            );
            if (!isMounted) return;
            if (!result.allowed) {
                const reason = result.reason ?? "total";
                setQuotaWarning({
                    title:
                        reason === "session"
                            ? "Chat image limit reached"
                            : "Storage limit reached",
                    message:
                        result.message ??
                        "Delete old conversations or start a new chat to add more images.",
                    reason,
                });
            } else {
                setQuotaWarning(null);
            }
        };
        void checkQuota();
        return () => {
            isMounted = false;
        };
    }, [pendingAttachmentBytes, sessionId]);

    const renderAttachmentThumbnail = ({
        item,
    }: {
        item: PendingAttachment;
    }) => {
        const aspectRatio =
            item.width && item.height ? item.width / item.height : 1;
        const thumbnailWidth = 60;
        const thumbnailHeight = thumbnailWidth / aspectRatio;

        return (
            <View style={styles.attachmentThumbnailContainer}>
                <Image
                    source={{ uri: item.preview }}
                    style={[
                        styles.attachmentThumbnail,
                        { width: thumbnailWidth, height: thumbnailHeight },
                    ]}
                    resizeMode="cover"
                />
                <TouchableOpacity
                    style={styles.removeAttachmentButton}
                    onPress={() => onRemoveAttachment(item.id)}
                    activeOpacity={0.7}
                >
                    <Feather name="x" size={12} color={colors.textOnAccent} />
                </TouchableOpacity>
            </View>
        );
    };

    const handleSendPress = () => {
        if (!canSend) return;
        inputRef.current?.clear();
        Keyboard.dismiss();
        onSend();
    };

    const controlsContent = (
        <>
            <ModelSelector
                models={models}
                selectedModelId={selectedModelId}
                onModelChange={onModelChange}
                favoriteModels={favoriteModels}
                onToggleFavoriteModel={onToggleFavoriteModel}
                disabled={isLoading}
            />
            {reasoningSupported && (
                <ThinkingToggle
                    value={thinkingLevel}
                    onChange={onThinkingChange}
                    disabled={isLoading}
                />
            )}
        </>
    );

    return (
        <View
            style={[
                styles.container,
                isTwoPaneLayout && styles.containerTablet,
            ]}
        >
            {quotaWarning && (
                <View style={[styles.quotaBanner, composerConstraintStyle]}>
                    <View style={styles.quotaHeader}>
                        <Feather
                            name="alert-triangle"
                            size={14}
                            color={colors.warning}
                        />
                        <Text style={styles.quotaTitle}>
                            {quotaWarning.title}
                        </Text>
                    </View>
                    <Text style={styles.quotaMessage}>
                        {quotaWarning.message}
                    </Text>
                    <View style={styles.quotaActions}>
                        {quotaWarning.reason === "session" ? (
                            <>
                                {onStartNewChat && (
                                    <TouchableOpacity
                                        style={styles.quotaPrimaryButton}
                                        onPress={onStartNewChat}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.quotaPrimaryText}>
                                            New chat
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                {onManageStorage && (
                                    <TouchableOpacity
                                        style={styles.quotaSecondaryButton}
                                        onPress={onManageStorage}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.quotaSecondaryText}>
                                            Delete old chats
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        ) : (
                            <>
                                {onManageStorage && (
                                    <TouchableOpacity
                                        style={styles.quotaPrimaryButton}
                                        onPress={onManageStorage}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.quotaPrimaryText}>
                                            Delete old chats
                                        </Text>
                                    </TouchableOpacity>
                                )}
                                {onStartNewChat && (
                                    <TouchableOpacity
                                        style={styles.quotaSecondaryButton}
                                        onPress={onStartNewChat}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.quotaSecondaryText}>
                                            New chat
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </>
                        )}
                    </View>
                </View>
            )}
            {attachments.length > 0 && (
                <View
                    style={[
                        styles.attachmentsContainer,
                        composerConstraintStyle,
                    ]}
                >
                    <FlatList
                        data={attachments}
                        renderItem={renderAttachmentThumbnail}
                        keyExtractor={(item) => item.id}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.attachmentsList}
                    />
                </View>
            )}

            {isTwoPaneLayout ? (
                <View
                    style={[styles.controlsContainer, composerConstraintStyle]}
                >
                    <View style={styles.controlsRowWrapped}>
                        {controlsContent}
                    </View>
                </View>
            ) : (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    style={styles.controlsContainer}
                    contentContainerStyle={styles.controlsRow}
                >
                    {controlsContent}
                </ScrollView>
            )}

            <View style={[styles.inputRow, composerConstraintStyle]}>
                <TextInput
                    ref={inputRef}
                    style={[
                        styles.textInput,
                        isTwoPaneLayout && styles.textInputTablet,
                    ]}
                    value={inputText}
                    onChangeText={onInputChange}
                    placeholder={
                        attachments.length > 0
                            ? "Add a caption..."
                            : "Type a message..."
                    }
                    placeholderTextColor={colors.textFaint}
                    multiline
                    maxLength={10000}
                    editable={!isLoading}
                />
                {visionSupported && (
                    <AttachmentPicker
                        onAttachmentsSelected={onAttachmentsChange}
                        disabled={
                            isLoading || disabled || Boolean(quotaWarning)
                        }
                        sessionId={sessionId}
                    />
                )}
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        !canSend && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSendPress}
                    disabled={!canSend}
                    activeOpacity={0.7}
                >
                    {isLoading ? (
                        <ActivityIndicator
                            color={colors.textOnAccent}
                            size="small"
                        />
                    ) : (
                        <Feather
                            name="send"
                            size={18}
                            color={
                                canSend
                                    ? colors.textOnAccent
                                    : colors.textSubtle
                            }
                        />
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const createStyles = (colors: ThemeColors, bottomPadding: number) =>
    StyleSheet.create({
        container: {
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
        },
        containerTablet: {
            paddingTop: 4,
        },
        quotaBanner: {
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
            gap: 6,
        },
        quotaHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        quotaTitle: {
            fontSize: 13,
            fontWeight: "600",
            color: colors.warning,
        },
        quotaMessage: {
            fontSize: 12,
            color: colors.textMuted,
        },
        quotaActions: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
        },
        quotaPrimaryButton: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: colors.warning,
        },
        quotaPrimaryText: {
            color: colors.textOnAccent,
            fontSize: 12,
            fontWeight: "600",
        },
        quotaSecondaryButton: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: colors.warningBorder,
            backgroundColor: colors.warningSoft,
        },
        quotaSecondaryText: {
            color: colors.warning,
            fontSize: 12,
            fontWeight: "600",
        },
        attachmentsContainer: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderMuted,
            backgroundColor: colors.surfaceMuted,
        },
        attachmentsList: {
            gap: 8,
        },
        attachmentThumbnailContainer: {
            position: "relative",
            marginRight: 8,
        },
        attachmentThumbnail: {
            borderRadius: 8,
            backgroundColor: colors.surfaceSubtle,
        },
        removeAttachmentButton: {
            position: "absolute",
            top: -6,
            right: -6,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: colors.danger,
            justifyContent: "center",
            alignItems: "center",
        },
        controlsContainer: {
            borderBottomWidth: 1,
            borderBottomColor: colors.borderMuted,
        },
        controlsRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
        },
        controlsRowWrapped: {
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
        },
        inputRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: bottomPadding,
            gap: 8,
        },
        textInput: {
            flex: 1,
            maxHeight: 120,
            minHeight: 44,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderRadius: 22,
            backgroundColor: colors.inputBackground,
            color: colors.text,
            fontSize: 16,
        },
        textInputTablet: {
            maxHeight: 160,
        },
        sendButton: {
            backgroundColor: colors.accent,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
        },
        sendButtonDisabled: {
            backgroundColor: colors.border,
        },
    });
