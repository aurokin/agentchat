import React, { useState, useMemo, useEffect, type ReactElement } from "react";
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
} from "react-native";
import type { OpenRouterModel } from "@shared/core/models";
import type { ThinkingLevel, SearchLevel } from "@shared/core/types";
import type { Skill } from "@shared/core/skills";
import type { PendingAttachment } from "@shared/core/types";
import { ModelSelector } from "./ModelSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { SkillSelector } from "./SkillSelector";
import { AttachmentPicker } from "./AttachmentPicker";
import { useTheme, type ThemeColors } from "../../contexts/ThemeContext";
import { modelSupportsVision } from "../../contexts/ModelContext";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MessageInputProps {
    inputText: string;
    onInputChange: (text: string) => void;
    onSend: () => void;
    isLoading: boolean;
    disabled?: boolean;
    models: OpenRouterModel[];
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    favoriteModels: string[];
    onToggleFavoriteModel: (modelId: string) => void;
    reasoningSupported: boolean;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    searchSupported: boolean;
    searchLevel: SearchLevel;
    onSearchChange: (value: SearchLevel) => void;
    skills: Skill[];
    selectedSkill: Skill | null;
    onSkillSelect: (skill: Skill | null) => void;
    attachments: PendingAttachment[];
    onAttachmentsChange: (attachments: PendingAttachment[]) => void;
    onRemoveAttachment: (attachmentId: string) => void;
    sessionId?: string;
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
    searchSupported,
    searchLevel,
    onSearchChange,
    skills,
    selectedSkill,
    onSkillSelect,
    attachments,
    onAttachmentsChange,
    onRemoveAttachment,
    sessionId,
}: MessageInputProps): ReactElement {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const bottomPadding = isKeyboardVisible ? 8 : 8 + insets.bottom;
    const styles = useMemo(
        () => createStyles(colors, bottomPadding),
        [colors, bottomPadding],
    );

    const canSend =
        (inputText.trim().length > 0 || attachments.length > 0) &&
        !disabled &&
        !isLoading;
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
                    <Text style={styles.removeAttachmentText}>×</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {attachments.length > 0 && (
                <View style={styles.attachmentsContainer}>
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

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.controlsContainer}
                contentContainerStyle={styles.controlsRow}
            >
                <ModelSelector
                    models={models}
                    selectedModelId={selectedModelId}
                    onModelChange={onModelChange}
                    favoriteModels={favoriteModels}
                    onToggleFavoriteModel={onToggleFavoriteModel}
                    disabled={isLoading}
                />
                <SkillSelector
                    skills={skills}
                    selectedSkill={selectedSkill}
                    onSelectSkill={onSkillSelect}
                    disabled={isLoading}
                />
                {searchSupported && (
                    <SearchToggle
                        value={searchLevel}
                        onChange={onSearchChange}
                        disabled={isLoading}
                    />
                )}
                {reasoningSupported && (
                    <ThinkingToggle
                        value={thinkingLevel}
                        onChange={onThinkingChange}
                        disabled={isLoading}
                    />
                )}
            </ScrollView>

            <View style={styles.inputRow}>
                <TextInput
                    style={styles.textInput}
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
                        disabled={isLoading}
                        sessionId={sessionId}
                    />
                )}
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        !canSend && styles.sendButtonDisabled,
                    ]}
                    onPress={onSend}
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
        removeAttachmentText: {
            color: colors.textOnAccent,
            fontSize: 14,
            fontWeight: "bold",
            lineHeight: 18,
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
