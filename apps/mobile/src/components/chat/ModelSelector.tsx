import React, { useState, useRef, useEffect, type ReactElement } from "react";
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

const styles = StyleSheet.create({
    container: {
        zIndex: 100,
    },
    trigger: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: "#f0f0f0",
        borderRadius: 8,
        minWidth: 120,
    },
    disabled: {
        opacity: 0.5,
    },
    triggerText: {
        fontSize: 14,
        color: "#333",
        flex: 1,
    },
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
    },
    modal: {
        backgroundColor: "#fff",
        borderRadius: 12,
        width: "85%",
        maxHeight: "70%",
        overflow: "hidden",
    },
    searchContainer: {
        padding: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    searchInput: {
        backgroundColor: "#f5f5f5",
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
        backgroundColor: "#f9f9f9",
        fontSize: 12,
        fontWeight: "600",
        color: "#666",
        textTransform: "uppercase",
    },
    option: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    optionSelected: {
        backgroundColor: "#e6f0ff",
    },
    optionText: {
        fontSize: 14,
        color: "#333",
    },
    optionTextSelected: {
        color: "#007AFF",
        fontWeight: "600",
    },
});
