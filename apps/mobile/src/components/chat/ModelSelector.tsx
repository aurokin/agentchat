import React, {
    useState,
    useRef,
    useEffect,
    useMemo,
    type ReactElement,
} from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    Modal,
    TextInput,
} from "react-native";
import type { OpenRouterModel } from "@shared/core/models";
import { useTheme, type ThemeColors } from "../../contexts/ThemeContext";

interface ModelSelectorProps {
    models: OpenRouterModel[];
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    disabled?: boolean;
}

export function ModelSelector({
    models,
    selectedModelId,
    onModelChange,
    disabled,
}: ModelSelectorProps): ReactElement {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const selectedModel = models.find((m) => m.id === selectedModelId);
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const filteredModels = searchQuery
        ? models.filter(
              (m) =>
                  m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.id.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : models;

    const groupedModels = filteredModels.reduce(
        (acc, model) => {
            const provider = model.provider || "Other";
            if (!acc[provider]) {
                acc[provider] = [];
            }
            acc[provider].push(model);
            return acc;
        },
        {} as Record<string, OpenRouterModel[]>,
    );

    const providers = Object.keys(groupedModels).sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
    });

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.trigger, disabled && styles.disabled]}
                onPress={() => !disabled && setIsOpen(true)}
                disabled={disabled}
                activeOpacity={0.7}
            >
                <Text style={styles.triggerText} numberOfLines={1}>
                    {selectedModel?.name || "Select Model"}
                </Text>
            </TouchableOpacity>

            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsOpen(false)}
            >
                <TouchableOpacity
                    style={styles.overlay}
                    activeOpacity={1}
                    onPress={() => setIsOpen(false)}
                >
                    <View style={styles.modal}>
                        <View style={styles.searchContainer}>
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search models..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholderTextColor={colors.textFaint}
                            />
                        </View>

                        <FlatList
                            data={providers}
                            keyExtractor={(provider) => provider}
                            renderItem={({ item: provider }) => (
                                <View>
                                    <Text style={styles.providerHeader}>
                                        {provider}
                                    </Text>
                                    {groupedModels[provider].map((model) => (
                                        <TouchableOpacity
                                            key={model.id}
                                            style={[
                                                styles.option,
                                                selectedModelId === model.id &&
                                                    styles.optionSelected,
                                            ]}
                                            onPress={() => {
                                                onModelChange(model.id);
                                                setIsOpen(false);
                                                setSearchQuery("");
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionText,
                                                    selectedModelId ===
                                                        model.id &&
                                                        styles.optionTextSelected,
                                                ]}
                                                numberOfLines={1}
                                            >
                                                {model.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                            style={styles.list}
                        />
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            zIndex: 100,
        },
        trigger: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: colors.surfaceSubtle,
            borderRadius: 8,
            minWidth: 120,
        },
        disabled: {
            opacity: 0.5,
        },
        triggerText: {
            fontSize: 14,
            color: colors.text,
            flex: 1,
        },
        overlay: {
            flex: 1,
            backgroundColor: colors.overlay,
            justifyContent: "center",
            alignItems: "center",
        },
        modal: {
            backgroundColor: colors.surface,
            borderRadius: 12,
            width: "85%",
            maxHeight: "70%",
            overflow: "hidden",
        },
        searchContainer: {
            padding: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        searchInput: {
            backgroundColor: colors.inputBackground,
            color: colors.text,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 14,
        },
        list: {
            maxHeight: 400,
        },
        providerHeader: {
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.surfaceMuted,
            fontSize: 12,
            fontWeight: "600",
            color: colors.textMuted,
            textTransform: "uppercase",
        },
        option: {
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderMuted,
        },
        optionSelected: {
            backgroundColor: colors.accentSoft,
        },
        optionText: {
            fontSize: 14,
            color: colors.text,
        },
        optionTextSelected: {
            color: colors.accent,
            fontWeight: "600",
        },
    });
