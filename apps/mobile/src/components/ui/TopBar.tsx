import React, { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";

type TopBarProps = {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    leftSlot?: ReactNode;
    rightSlot?: ReactNode;
    bottomSlot?: ReactNode;
};

export function TopBar({
    eyebrow,
    title,
    subtitle,
    leftSlot,
    rightSlot,
    bottomSlot,
}: TopBarProps): React.ReactElement {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    return (
        <View style={styles.container}>
            <View style={styles.mainRow}>
                <View style={styles.sideSlot}>{leftSlot}</View>
                <View style={styles.textColumn}>
                    {eyebrow ? (
                        <Text style={styles.eyebrow} numberOfLines={1}>
                            {eyebrow}
                        </Text>
                    ) : null}
                    <Text style={styles.title} numberOfLines={1}>
                        {title}
                    </Text>
                    {subtitle ? (
                        <Text style={styles.subtitle} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    ) : null}
                </View>
                <View style={[styles.sideSlot, styles.sideSlotTrailing]}>
                    {rightSlot}
                </View>
            </View>
            {bottomSlot ? (
                <View style={styles.bottomRow}>{bottomSlot}</View>
            ) : null}
        </View>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
            gap: 10,
        },
        mainRow: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
        },
        sideSlot: {
            minWidth: 36,
            alignItems: "flex-start",
            justifyContent: "center",
        },
        sideSlotTrailing: {
            alignItems: "flex-end",
        },
        textColumn: {
            flex: 1,
            minWidth: 0,
            gap: 2,
        },
        eyebrow: {
            color: colors.textSubtle,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.8,
            textTransform: "uppercase",
        },
        title: {
            color: colors.text,
            fontSize: 19,
            fontWeight: "700",
        },
        subtitle: {
            color: colors.textMuted,
            fontSize: 13,
        },
        bottomRow: {
            paddingLeft: 48,
        },
    });
