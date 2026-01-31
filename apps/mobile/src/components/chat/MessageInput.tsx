import React, { useState, useEffect, useMemo, type ReactElement } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Image,
    FlatList,
    Dimensions,
} from "react-native";
import type { OpenRouterModel } from "@shared/core/models";
import type { ThinkingLevel, SearchLevel } from "@shared/core/types";
import type { Skill } from "@shared/core/skills";
import type { Attachment } from "@shared/core/types";
import { ModelSelector } from "./ModelSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { SkillSelector } from "./SkillSelector";
import { AttachmentPicker } from "./AttachmentPicker";
import { getLocalQuotaStatus, formatBytes } from "../../lib/storage";
import { useTheme, type ThemeColors } from "../../contexts/ThemeContext";

interface MessageInputProps {
    inputText: string;
    onInputChange: (text: string) => void;
    onSend: () => void;
    isLoading: boolean;
    disabled?: boolean;
    models: OpenRouterModel[];
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    reasoningSupported: boolean;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
    searchSupported: boolean;
    searchLevel: SearchLevel;
    onSearchChange: (value: SearchLevel) => void;
    skills: Skill[];
    selectedSkill: Skill | null;
    onSkillSelect: (skill: Skill | null) => void;
    attachments: Attachment[];
    onAttachmentsChange: (attachments: Attachment[]) => void;
    onRemoveAttachment: (attachmentId: string) => void;
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
}: MessageInputProps): ReactElement {
    const [quotaStatus, setQuotaStatus] = useState<{
        percentage: number;
        isWarning80: boolean;
        isWarning95: boolean;
        isExceeded: boolean;
        used: number;
        limit: number;
    } | null>(null);
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    useEffect(() => {
        const loadQuota = async () => {
            try {
                const status = await getLocalQuotaStatus();
                setQuotaStatus(status);
            } catch {
                // Ignore quota errors
            }
        };
        loadQuota();
    }, [attachments.length]);

    const canSend =
        (inputText.trim().length > 0 || attachments.length > 0) && !disabled;

    const screenWidth = Dimensions.get("window").width;

    const renderAttachmentThumbnail = ({ item }: { item: Attachment }) => {
        const aspectRatio =
            item.width && item.height ? item.width / item.height : 1;
        const thumbnailWidth = 60;
        const thumbnailHeight = thumbnailWidth / aspectRatio;

        return (
            <View style={styles.attachmentThumbnailContainer}>
                <Image
                    source={{ uri: item.data }}
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
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            style={styles.container}
        >
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

            {quotaStatus && (
                <View style={styles.quotaContainer}>
                    <View style={styles.quotaBarBackground}>
                        <View
                            style={[
                                styles.quotaBarFill,
                                {
                                    width: `${Math.min(quotaStatus.percentage * 100, 100)}%`,
                                    backgroundColor: quotaStatus.isExceeded
                                        ? colors.danger
                                        : quotaStatus.isWarning80
                                          ? colors.warning
                                          : colors.success,
                                },
                            ]}
                        />
                    </View>
                    <Text
                        style={[
                            styles.quotaText,
                            quotaStatus.isExceeded && styles.quotaTextDanger,
                        ]}
                    >
                        {formatBytes(quotaStatus.used)} /{" "}
                        {formatBytes(quotaStatus.limit)} used
                        {quotaStatus.isExceeded
                            ? " - Storage full"
                            : quotaStatus.isWarning95
                              ? " - Near limit"
                              : ""}
                    </Text>
                </View>
            )}

            <View style={styles.controlsRow}>
                <AttachmentPicker
                    onAttachmentsSelected={onAttachmentsChange}
                    disabled={isLoading || disabled}
                />
                <ModelSelector
                    models={models}
                    selectedModelId={selectedModelId}
                    onModelChange={onModelChange}
                    disabled={isLoading}
                />
                <SkillSelector
                    skills={skills}
                    selectedSkill={selectedSkill}
                    onSelectSkill={onSkillSelect}
                    disabled={isLoading}
                />
                <View style={styles.spacer} />
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
            </View>

            <View style={styles.inputWrapper}>
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
                    editable={!disabled}
                />
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
                        <Text style={styles.sendButtonText}>Send</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const createStyles = (colors: ThemeColors) =>
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
        controlsRow: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderMuted,
        },
        spacer: {
            flex: 1,
        },
        inputWrapper: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
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
            marginRight: 8,
        },
        sendButton: {
            backgroundColor: colors.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 22,
            justifyContent: "center",
        },
        sendButtonDisabled: {
            backgroundColor: colors.border,
        },
        sendButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        quotaContainer: {
            paddingHorizontal: 12,
            paddingVertical: 6,
            backgroundColor: colors.surfaceMuted,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        quotaBarBackground: {
            height: 4,
            backgroundColor: colors.borderMuted,
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 4,
        },
        quotaBarFill: {
            height: "100%",
            borderRadius: 2,
        },
        quotaText: {
            fontSize: 11,
            color: colors.textMuted,
            textAlign: "center",
        },
        quotaTextDanger: {
            color: colors.danger,
            fontWeight: "600",
        },
    });
