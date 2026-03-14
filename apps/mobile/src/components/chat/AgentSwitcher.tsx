import React, { useMemo, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAgent } from "@/contexts/AgentContext";
import { useChatContext } from "@/contexts/ChatContext";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";

export function AgentSwitcher({
    compact = false,
    onAgentChange,
}: {
    compact?: boolean;
    onAgentChange?: (agentId: string) => void;
}): React.ReactElement {
    const {
        agents,
        selectedAgentId,
        selectedAgent,
        setSelectedAgentId,
        loadingAgents,
    } = useAgent();
    const { conversationRuntimeBindings } = useChatContext();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [isOpen, setIsOpen] = useState(false);

    const visibleAgents = agents.filter((agent) => agent.enabled);
    const activeRunCountsByAgent = useMemo(() => {
        const counts = new Map<string, number>();
        for (const binding of Object.values(conversationRuntimeBindings)) {
            if (binding.status !== "active") {
                continue;
            }
            counts.set(binding.agentId, (counts.get(binding.agentId) ?? 0) + 1);
        }
        return counts;
    }, [conversationRuntimeBindings]);

    const handleSelect = async (agentId: string) => {
        await setSelectedAgentId(agentId);
        setIsOpen(false);
        onAgentChange?.(agentId);
    };

    return (
        <>
            <TouchableOpacity
                style={[styles.trigger, compact ? styles.triggerCompact : null]}
                activeOpacity={0.7}
                onPress={() => setIsOpen(true)}
                disabled={loadingAgents || visibleAgents.length === 0}
            >
                <Text style={styles.triggerText} numberOfLines={1}>
                    {selectedAgent?.name ?? "Select Agent"}
                    {selectedAgentId &&
                    (activeRunCountsByAgent.get(selectedAgentId) ?? 0) > 0
                        ? ` · ${activeRunCountsByAgent.get(selectedAgentId)} active`
                        : ""}
                </Text>
                <Feather
                    name="chevron-down"
                    size={16}
                    color={colors.textMuted}
                />
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
                        <Text style={styles.modalTitle}>Switch Agent</Text>
                        {visibleAgents.map((agent) => {
                            const isSelected = agent.id === selectedAgentId;
                            const activeCount =
                                activeRunCountsByAgent.get(agent.id) ?? 0;
                            return (
                                <TouchableOpacity
                                    key={agent.id}
                                    style={[
                                        styles.agentRow,
                                        isSelected
                                            ? styles.agentRowSelected
                                            : null,
                                    ]}
                                    onPress={() => {
                                        void handleSelect(agent.id);
                                    }}
                                >
                                    <View style={styles.agentContent}>
                                        <Text
                                            style={styles.agentName}
                                            numberOfLines={1}
                                        >
                                            {agent.name}
                                            {activeCount > 0
                                                ? ` · ${activeCount} active`
                                                : ""}
                                        </Text>
                                        {agent.description ? (
                                            <Text
                                                style={styles.agentDescription}
                                                numberOfLines={2}
                                            >
                                                {agent.description}
                                            </Text>
                                        ) : null}
                                    </View>
                                    {isSelected ? (
                                        <Feather
                                            name="check"
                                            size={16}
                                            color={colors.accent}
                                        />
                                    ) : null}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        trigger: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
        },
        triggerCompact: {
            paddingHorizontal: 10,
            paddingVertical: 6,
        },
        triggerText: {
            flexShrink: 1,
            color: colors.text,
            fontSize: 14,
            fontWeight: "600",
        },
        overlay: {
            flex: 1,
            backgroundColor: colors.overlay,
            justifyContent: "center",
            padding: 20,
        },
        modal: {
            borderRadius: 16,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 16,
            gap: 10,
        },
        modalTitle: {
            fontSize: 18,
            fontWeight: "700",
            color: colors.text,
            marginBottom: 4,
        },
        agentRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            paddingHorizontal: 12,
            paddingVertical: 12,
        },
        agentRowSelected: {
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
        },
        agentContent: {
            flex: 1,
            gap: 4,
        },
        agentName: {
            color: colors.text,
            fontSize: 15,
            fontWeight: "600",
        },
        agentDescription: {
            color: colors.textMuted,
            fontSize: 13,
            lineHeight: 18,
        },
    });
