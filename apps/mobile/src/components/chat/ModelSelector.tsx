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
    type GestureResponderEvent,
} from "react-native";
import type { ProviderModel } from "@shared/core/models";
import { MaterialIcons } from "@expo/vector-icons";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import {
    filterModels,
    splitFavoriteModels,
    groupModelsByProvider,
    getProviderOrder,
} from "@/components/chat/model-selector-utils";

interface ModelSelectorProps {
    models: ProviderModel[];
    selectedModelId: string | null;
    onModelChange: (modelId: string) => void;
    favoriteModels: string[];
    onToggleFavoriteModel: (modelId: string) => void;
    disabled?: boolean;
}

export function ModelSelector({
    models,
    selectedModelId,
    onModelChange,
    favoriteModels,
    onToggleFavoriteModel,
    disabled,
}: ModelSelectorProps): ReactElement {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const searchInputRef = useRef<TextInput>(null);

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            const timeoutId = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen]);

    const filteredModels = useMemo(
        () => filterModels(models, searchQuery),
        [models, searchQuery],
    );

    const { favoriteModelList, otherModels } = useMemo(
        () => splitFavoriteModels(filteredModels, favoriteModels),
        [filteredModels, favoriteModels],
    );

    const groupedModels = useMemo(
        () => groupModelsByProvider(otherModels),
        [otherModels],
    );
    const providerOrder = useMemo(
        () => getProviderOrder(otherModels),
        [otherModels],
    );

    const sections = useMemo(() => {
        const results: {
            key: string;
            title: string;
            models: ProviderModel[];
            isFavorites?: boolean;
        }[] = [];

        if (favoriteModelList.length > 0) {
            results.push({
                key: "favorites",
                title: "Favorites",
                models: favoriteModelList,
                isFavorites: true,
            });
        }

        for (const provider of providerOrder) {
            const providerModels = groupedModels[provider];
            if (providerModels && providerModels.length > 0) {
                results.push({
                    key: provider,
                    title: provider,
                    models: providerModels,
                });
            }
        }

        return results;
    }, [favoriteModelList, groupedModels, providerOrder]);

    const selectedModelDisplay = useMemo(() => {
        if (!selectedModelId) return "Select Model";
        const model = models.find((m) => m.id === selectedModelId);
        if (model) return model.name;
        return selectedModelId.split("/").pop() || selectedModelId;
    }, [models, selectedModelId]);

    const showEmptyState = models.length === 0;
    const showNoResults =
        models.length > 0 &&
        filteredModels.length === 0 &&
        searchQuery.trim().length > 0;

    const handleSelect = (modelId: string) => {
        onModelChange(modelId);
        setIsOpen(false);
        setSearchQuery("");
    };

    const handleClose = () => {
        setIsOpen(false);
        setSearchQuery("");
    };

    const handleToggleFavorite = (
        event: GestureResponderEvent,
        modelId: string,
    ) => {
        event.stopPropagation();
        onToggleFavoriteModel(modelId);
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.trigger, disabled && styles.disabled]}
                onPress={() => !disabled && setIsOpen(true)}
                disabled={disabled}
                activeOpacity={0.7}
            >
                <Text style={styles.triggerText} numberOfLines={1}>
                    {selectedModelDisplay}
                </Text>
            </TouchableOpacity>

            <Modal
                visible={isOpen}
                transparent
                animationType="fade"
                onRequestClose={handleClose}
            >
                <TouchableOpacity
                    style={styles.overlay}
                    activeOpacity={1}
                    onPress={handleClose}
                >
                    <View style={styles.modal}>
                        <View style={styles.searchContainer}>
                            <TextInput
                                ref={searchInputRef}
                                style={styles.searchInput}
                                placeholder="Search models..."
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholderTextColor={colors.textFaint}
                            />
                        </View>

                        {showEmptyState ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>
                                    No models available
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    Failed to load models
                                </Text>
                            </View>
                        ) : showNoResults ? (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>
                                    No models found
                                </Text>
                                <Text style={styles.emptySubtext}>
                                    Try a different search term
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={sections}
                                keyExtractor={(section) => section.key}
                                renderItem={({ item: section }) => (
                                    <View>
                                        {section.isFavorites ? (
                                            <View
                                                style={styles.favoritesHeader}
                                            >
                                                <MaterialIcons
                                                    name="star"
                                                    size={12}
                                                    color={colors.accent}
                                                />
                                                <Text
                                                    style={
                                                        styles.favoritesHeaderText
                                                    }
                                                >
                                                    Favorites
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.providerHeader}>
                                                {section.title}
                                            </Text>
                                        )}
                                        {section.models.map((model) => {
                                            const isFavorite =
                                                favoriteModels.includes(
                                                    model.id,
                                                );
                                            return (
                                                <TouchableOpacity
                                                    key={model.id}
                                                    style={[
                                                        styles.option,
                                                        selectedModelId ===
                                                            model.id &&
                                                            styles.optionSelected,
                                                    ]}
                                                    onPress={() =>
                                                        handleSelect(model.id)
                                                    }
                                                >
                                                    <View
                                                        style={
                                                            styles.optionContent
                                                        }
                                                    >
                                                        <TouchableOpacity
                                                            style={
                                                                styles.favoriteButton
                                                            }
                                                            onPress={(event) =>
                                                                handleToggleFavorite(
                                                                    event,
                                                                    model.id,
                                                                )
                                                            }
                                                            activeOpacity={0.7}
                                                        >
                                                            <MaterialIcons
                                                                name={
                                                                    isFavorite
                                                                        ? "star"
                                                                        : "star-border"
                                                                }
                                                                size={16}
                                                                color={
                                                                    isFavorite
                                                                        ? colors.accent
                                                                        : colors.textFaint
                                                                }
                                                            />
                                                        </TouchableOpacity>
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
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                                style={styles.list}
                                keyboardShouldPersistTaps="handled"
                            />
                        )}
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
        favoritesHeader: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: colors.accentSoft,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        favoritesHeaderText: {
            fontSize: 12,
            fontWeight: "600",
            color: colors.accent,
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
        optionContent: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
        },
        favoriteButton: {
            padding: 2,
        },
        optionText: {
            fontSize: 14,
            color: colors.text,
            flex: 1,
        },
        optionTextSelected: {
            color: colors.accent,
            fontWeight: "600",
        },
        emptyState: {
            padding: 24,
            alignItems: "center",
        },
        emptyText: {
            fontSize: 14,
            color: colors.textSubtle,
        },
        emptySubtext: {
            fontSize: 12,
            color: colors.textFaint,
            marginTop: 4,
        },
    });
