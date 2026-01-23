import React, { useState, type ReactElement } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from "react-native";
import type { OpenRouterModel } from "@shared/core/models";
import type { ThinkingLevel, SearchLevel } from "@shared/core/types";
import type { Skill } from "@shared/core/skills";
import { ModelSelector } from "./ModelSelector";
import { ThinkingToggle } from "./ThinkingToggle";
import { SearchToggle } from "./SearchToggle";
import { SkillSelector } from "./SkillSelector";

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
}: MessageInputProps): ReactElement {
    const canSend = inputText.trim().length > 0 && !disabled;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            style={styles.container}
        >
            <View style={styles.controlsRow}>
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
                    placeholder="Type a message..."
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
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={styles.sendButtonText}>Send</Text>
                    )}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        borderTopWidth: 1,
        borderTopColor: "#eee",
        backgroundColor: "#fff",
    },
    controlsRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#f5f5f5",
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
        backgroundColor: "#f0f0f0",
        fontSize: 16,
        marginRight: 8,
    },
    sendButton: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 22,
        justifyContent: "center",
    },
    sendButtonDisabled: {
        backgroundColor: "#ccc",
    },
    sendButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
});
