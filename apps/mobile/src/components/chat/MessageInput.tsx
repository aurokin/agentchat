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
    Keyboard,
    Platform,
    ScrollView,
    useWindowDimensions,
} from "react-native";
import type { ProviderModel } from "@shared/core/models";
import type { ThinkingLevel } from "@shared/core/types";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { ThinkingToggle } from "@/components/chat/ThinkingToggle";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MessageInputProps {
    inputText: string;
    onInputChange: (text: string) => void;
    onSend: () => void;
    onCancel?: () => void;
    isLoading: boolean;
    disabled?: boolean;
    settingsLocked?: boolean;
    models: ProviderModel[];
    availableProviders: Array<{
        id: string;
        label: string;
    }>;
    selectedProviderId: string | null;
    onProviderChange: (providerId: string) => void;
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    favoriteModels: string[];
    onToggleFavoriteModel: (modelId: string) => void;
    reasoningSupported: boolean;
    thinkingLevel: ThinkingLevel;
    onThinkingChange: (value: ThinkingLevel) => void;
}

export function MessageInput({
    inputText,
    onInputChange,
    onSend,
    onCancel,
    isLoading,
    disabled,
    settingsLocked,
    models,
    availableProviders,
    selectedProviderId,
    onProviderChange,
    selectedModelId,
    onModelChange,
    favoriteModels,
    onToggleFavoriteModel,
    reasoningSupported,
    thinkingLevel,
    onThinkingChange,
}: MessageInputProps): ReactElement {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
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

    const canSend = inputText.trim().length > 0 && !disabled && !isLoading;

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

    const handleSendPress = () => {
        if (isLoading) {
            onCancel?.();
            return;
        }
        if (!canSend) return;
        inputRef.current?.clear();
        Keyboard.dismiss();
        onSend();
    };

    const controlsContent = (
        <>
            <ModelSelector
                models={models}
                availableProviders={availableProviders}
                selectedProviderId={selectedProviderId}
                onProviderChange={onProviderChange}
                selectedModelId={selectedModelId}
                onModelChange={onModelChange}
                favoriteModels={favoriteModels}
                onToggleFavoriteModel={onToggleFavoriteModel}
                disabled={isLoading || settingsLocked}
            />
            {reasoningSupported && (
                <ThinkingToggle
                    value={thinkingLevel}
                    onChange={onThinkingChange}
                    disabled={isLoading || settingsLocked}
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
                    placeholder="Type a message..."
                    placeholderTextColor={colors.textFaint}
                    multiline
                    maxLength={10000}
                    editable={!isLoading}
                />
                <TouchableOpacity
                    style={[
                        styles.sendButton,
                        !canSend && !isLoading && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSendPress}
                    disabled={!canSend && !isLoading}
                    activeOpacity={0.7}
                >
                    {isLoading ? (
                        <Feather
                            name="square"
                            size={16}
                            color={colors.textOnAccent}
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
