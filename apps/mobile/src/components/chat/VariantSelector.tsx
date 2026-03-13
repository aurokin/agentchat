import React, { useMemo, type ReactElement } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import type { ProviderVariant } from "@shared/core/models";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";

interface VariantSelectorProps {
    variants: ProviderVariant[];
    selectedVariantId: string | null;
    onVariantChange: (variantId: string) => void;
    disabled?: boolean;
}

export function VariantSelector({
    variants,
    selectedVariantId,
    onVariantChange,
    disabled,
}: VariantSelectorProps): ReactElement | null {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    if (variants.length <= 1) {
        return null;
    }

    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.row}
            >
                {variants.map((variant) => {
                    const isSelected = selectedVariantId === variant.id;
                    return (
                        <TouchableOpacity
                            key={variant.id}
                            style={[
                                styles.chip,
                                isSelected && styles.chipSelected,
                                disabled && styles.chipDisabled,
                            ]}
                            onPress={() => onVariantChange(variant.id)}
                            disabled={disabled}
                            activeOpacity={0.7}
                        >
                            <Text
                                style={[
                                    styles.chipText,
                                    isSelected && styles.chipTextSelected,
                                ]}
                            >
                                {variant.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flexShrink: 1,
        },
        row: {
            flexDirection: "row",
            gap: 8,
        },
        chip: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSubtle,
        },
        chipSelected: {
            borderColor: colors.accent,
            backgroundColor: colors.accentSoft,
        },
        chipDisabled: {
            opacity: 0.5,
        },
        chipText: {
            color: colors.textSubtle,
            fontSize: 13,
            fontWeight: "600",
        },
        chipTextSelected: {
            color: colors.accent,
        },
    });
