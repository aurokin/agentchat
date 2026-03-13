import React, { useState, useMemo, type ReactElement } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Alert,
    Image,
    Platform,
    useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { type UserTheme } from "@/lib/storage";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "@/lib/convex/AuthContext";
import { useAgent } from "@/contexts/AgentContext";
import { useModelContext } from "@/contexts/ModelContext";
import { AgentSwitcher } from "@/components/chat/AgentSwitcher";
import { buildAgentSettingsSummary } from "@/lib/settings-summary";

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const {
        user,
        isAuthenticated,
        isLoading: isAuthLoading,
        signIn,
        signOut,
        isConvexAvailable,
    } = useAuthContext();
    const { selectedAgent } = useAgent();
    const { models, selectedProviderId, selectedModel, selectedVariantId } =
        useModelContext();
    const { colors, userTheme, setUserTheme, isMaterialYouActive } = useTheme();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [isSigningIn, setIsSigningIn] = useState(false);

    const convexUnavailableMessage = "Convex isn't configured for this build.";

    const handleSignOut = async () => {
        Alert.alert(
            "Sign Out",
            "Are you sure you want to sign out? Your workspace data will remain in Convex.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        await signOut();
                        Alert.alert(
                            "Signed Out",
                            "You have been signed out successfully.",
                        );
                    },
                },
            ],
        );
    };

    const performSignIn = async () => {
        setIsSigningIn(true);
        try {
            await signIn();
        } catch (error) {
            const rawMessage =
                error instanceof Error ? error.message : String(error);
            const normalizedMessage = rawMessage.toLowerCase();
            const isConnectionLost =
                normalizedMessage.includes(
                    "connection lost while action was in flight",
                ) ||
                normalizedMessage.includes("stream end encountered") ||
                normalizedMessage.includes("websocket") ||
                normalizedMessage.includes("connection lost");
            const message = isConnectionLost
                ? "Connection lost while signing in. Please try again."
                : rawMessage ||
                  "Could not sign in with Google. Please try again.";
            Alert.alert("Sign In Failed", message, [{ text: "OK" }]);
        } finally {
            setIsSigningIn(false);
        }
    };

    const handleGoogleSignIn = async () => {
        if (!isConvexAvailable) {
            Alert.alert("Convex Not Configured", convexUnavailableMessage, [
                { text: "OK" },
            ]);
            return;
        }

        await performSignIn();
    };

    const handleThemeChange = async (theme: UserTheme) => {
        await setUserTheme(theme);
    };
    const agentSummary = useMemo(
        () =>
            buildAgentSettingsSummary({
                selectedAgent,
                selectedProviderId,
                selectedModelId: selectedModel,
                selectedVariantId,
                models,
            }),
        [
            models,
            selectedAgent,
            selectedModel,
            selectedProviderId,
            selectedVariantId,
        ],
    );
    const isGoogleButtonBusy = isAuthLoading || isSigningIn;
    const isTwoPaneLayout = Math.min(windowWidth, windowHeight) >= 700;
    const settingsRailWidth = Math.max(256, Math.min(320, windowWidth * 0.28));
    const settingsContentMaxWidth = Math.max(
        620,
        Math.min(980, windowWidth - settingsRailWidth - 48),
    );

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/");
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View
                    style={[
                        styles.settingsLayout,
                        isTwoPaneLayout && styles.settingsLayoutTablet,
                    ]}
                >
                    {isTwoPaneLayout && (
                        <View
                            style={[
                                styles.tabletRail,
                                { width: settingsRailWidth },
                            ]}
                        >
                            <View style={styles.tabletRailHeader}>
                                <Text style={styles.tabletRailAppName}>
                                    Agentchat
                                </Text>
                                <Text style={styles.tabletRailTitle}>
                                    Settings
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.tabletRailBackButton}
                                onPress={handleBack}
                                accessibilityLabel="Back to chats"
                            >
                                <Feather
                                    name="arrow-left"
                                    size={16}
                                    color={colors.accent}
                                />
                                <Text style={styles.tabletRailBackButtonText}>
                                    Back to chats
                                </Text>
                            </TouchableOpacity>
                            <View style={styles.tabletRailSummaryCard}>
                                <Text style={styles.tabletRailSummaryLabel}>
                                    Account
                                </Text>
                                <Text
                                    style={styles.tabletRailSummaryValue}
                                    numberOfLines={1}
                                >
                                    {isAuthenticated
                                        ? user?.email || "Signed in"
                                        : "Signed out"}
                                </Text>
                                <Text style={styles.tabletRailSummaryLabel}>
                                    Agent
                                </Text>
                                <Text style={styles.tabletRailSummaryValue}>
                                    {agentSummary.agentName}
                                </Text>
                                <Text style={styles.tabletRailSummaryLabel}>
                                    Model
                                </Text>
                                <Text style={styles.tabletRailSummaryValue}>
                                    {agentSummary.modelLabel}
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.settingsMain}>
                        {!isTwoPaneLayout && (
                            <View style={styles.header}>
                                <TouchableOpacity
                                    onPress={handleBack}
                                    style={styles.backButton}
                                    accessibilityLabel="Back"
                                >
                                    <Feather
                                        name="arrow-left"
                                        size={20}
                                        color={colors.accent}
                                    />
                                </TouchableOpacity>
                                <Text style={styles.headerTitle}>Settings</Text>
                                <View style={styles.headerSpacer} />
                            </View>
                        )}

                        <ScrollView
                            style={styles.scrollContent}
                            contentContainerStyle={[
                                styles.scrollContentContainer,
                                isTwoPaneLayout &&
                                    styles.scrollContentContainerTablet,
                            ]}
                        >
                            <View
                                style={[
                                    styles.sectionsColumn,
                                    isTwoPaneLayout && {
                                        maxWidth: settingsContentMaxWidth,
                                    },
                                ]}
                            >
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        Account
                                    </Text>

                                    {isAuthLoading ? (
                                        <ActivityIndicator
                                            style={styles.loading}
                                            color={colors.accent}
                                        />
                                    ) : isAuthenticated && user ? (
                                        <View style={styles.userInfo}>
                                            {user.image && (
                                                <Image
                                                    source={{ uri: user.image }}
                                                    style={styles.userAvatar}
                                                />
                                            )}
                                            <View style={styles.userDetails}>
                                                <Text style={styles.userName}>
                                                    {user.name || "User"}
                                                </Text>
                                                <Text style={styles.userEmail}>
                                                    {user.email}
                                                </Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={styles.notSignedIn}>
                                            Sign in to access your Agentchat
                                            workspace.
                                        </Text>
                                    )}

                                    {isConvexAvailable && (
                                        <TouchableOpacity
                                            style={[
                                                styles.googleButton,
                                                isGoogleButtonBusy &&
                                                    styles.googleButtonDisabled,
                                            ]}
                                            onPress={
                                                isAuthenticated
                                                    ? handleSignOut
                                                    : handleGoogleSignIn
                                            }
                                            disabled={isGoogleButtonBusy}
                                        >
                                            {isGoogleButtonBusy ? (
                                                <View
                                                    style={
                                                        styles.googleButtonContent
                                                    }
                                                >
                                                    <ActivityIndicator
                                                        color={
                                                            colors.textOnAccent
                                                        }
                                                        style={
                                                            styles.googleButtonSpinner
                                                        }
                                                    />
                                                    <Text
                                                        style={
                                                            styles.googleButtonText
                                                        }
                                                    >
                                                        {isSigningIn
                                                            ? "Signing in..."
                                                            : "Loading..."}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text
                                                    style={
                                                        styles.googleButtonText
                                                    }
                                                >
                                                    {isAuthenticated
                                                        ? "Sign Out"
                                                        : "Sign in with Google"}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    )}

                                    {!isConvexAvailable && (
                                        <View style={styles.cloudWarning}>
                                            <Text
                                                style={styles.cloudWarningText}
                                            >
                                                {convexUnavailableMessage}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        Agent
                                    </Text>
                                    <Text style={styles.sectionDescription}>
                                        Switch the active agent for this device.
                                        Conversations, defaults, and runtime
                                        state are scoped to the selected agent.
                                    </Text>
                                    <View style={styles.storageContainer}>
                                        <AgentSwitcher />
                                        <Text style={styles.storageInfoText}>
                                            {agentSummary.agentDescription ??
                                                "This instance exposes agents from the server configuration."}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        Conversation Defaults
                                    </Text>
                                    <Text style={styles.sectionDescription}>
                                        Provider, model, and variant options are
                                        managed by the instance and narrowed by
                                        the selected agent.
                                    </Text>
                                    <View style={styles.storageContainer}>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>
                                                Provider
                                            </Text>
                                            <Text style={styles.summaryValue}>
                                                {agentSummary.providerLabel}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>
                                                Model
                                            </Text>
                                            <Text style={styles.summaryValue}>
                                                {agentSummary.modelLabel}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>
                                                Variant
                                            </Text>
                                            <Text style={styles.summaryValue}>
                                                {agentSummary.variantLabel}
                                            </Text>
                                        </View>
                                        <Text style={styles.storageInfoText}>
                                            Update these defaults from the chat
                                            composer before the first message in
                                            a conversation.
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        Theme
                                    </Text>
                                    <Text style={styles.sectionDescription}>
                                        Choose your preferred color scheme
                                    </Text>
                                    <View style={styles.themeContainer}>
                                        <TouchableOpacity
                                            style={[
                                                styles.themeOption,
                                                userTheme === "light" &&
                                                    styles.themeOptionSelected,
                                            ]}
                                            onPress={() =>
                                                handleThemeChange("light")
                                            }
                                        >
                                            <Feather
                                                name="sun"
                                                size={22}
                                                color={
                                                    userTheme === "light"
                                                        ? colors.accent
                                                        : colors.textMuted
                                                }
                                                style={styles.themeIcon}
                                            />
                                            <Text
                                                style={[
                                                    styles.themeLabel,
                                                    userTheme === "light" &&
                                                        styles.themeLabelSelected,
                                                ]}
                                            >
                                                Light
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.themeOption,
                                                userTheme === "dark" &&
                                                    styles.themeOptionSelected,
                                            ]}
                                            onPress={() =>
                                                handleThemeChange("dark")
                                            }
                                        >
                                            <Feather
                                                name="moon"
                                                size={22}
                                                color={
                                                    userTheme === "dark"
                                                        ? colors.accent
                                                        : colors.textMuted
                                                }
                                                style={styles.themeIcon}
                                            />
                                            <Text
                                                style={[
                                                    styles.themeLabel,
                                                    userTheme === "dark" &&
                                                        styles.themeLabelSelected,
                                                ]}
                                            >
                                                Dark
                                            </Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[
                                                styles.themeOption,
                                                userTheme === "system" &&
                                                    styles.themeOptionSelected,
                                            ]}
                                            onPress={() =>
                                                handleThemeChange("system")
                                            }
                                        >
                                            <Feather
                                                name="monitor"
                                                size={22}
                                                color={
                                                    userTheme === "system"
                                                        ? colors.accent
                                                        : colors.textMuted
                                                }
                                                style={styles.themeIcon}
                                            />
                                            <Text
                                                style={[
                                                    styles.themeLabel,
                                                    userTheme === "system" &&
                                                        styles.themeLabelSelected,
                                                ]}
                                            >
                                                System
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    {Platform.OS === "android" && (
                                        <View style={styles.materialYouHint}>
                                            <Feather
                                                name={
                                                    isMaterialYouActive
                                                        ? "droplet"
                                                        : "smartphone"
                                                }
                                                size={14}
                                                color={colors.textMuted}
                                            />
                                            <Text
                                                style={
                                                    styles.materialYouHintText
                                                }
                                            >
                                                {isMaterialYouActive
                                                    ? "Material You colors are active from your system wallpaper."
                                                    : "Select System theme to enable Material You colors on Android 12+."}
                                            </Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        Workspace
                                    </Text>
                                    <View style={styles.storageContainer}>
                                        <Text style={styles.storageInfoText}>
                                            {isAuthenticated
                                                ? "Chat history, settings, and runtime state are stored in Convex for this instance."
                                                : "Sign in to access this instance's Convex-backed workspace."}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>
                                        About
                                    </Text>
                                    <View style={styles.settingItem}>
                                        <Text style={styles.appName}>
                                            Agentchat
                                        </Text>
                                        <Text style={styles.version}>
                                            Version 1.0.0
                                        </Text>
                                    </View>
                                    <Text style={styles.settingDescription}>
                                        A self-hosted AI chat app powered by
                                        Convex and a server-managed provider
                                        backend.
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        settingsLayout: {
            flex: 1,
        },
        settingsLayoutTablet: {
            flexDirection: "row",
        },
        settingsMain: {
            flex: 1,
        },
        tabletRail: {
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: 16,
            paddingVertical: 16,
            gap: 16,
        },
        tabletRailHeader: {
            gap: 4,
        },
        tabletRailAppName: {
            fontSize: 18,
            fontWeight: "700",
            color: colors.text,
        },
        tabletRailTitle: {
            fontSize: 13,
            color: colors.textSubtle,
            textTransform: "uppercase",
            letterSpacing: 0.8,
        },
        tabletRailBackButton: {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            backgroundColor: colors.accentSoft,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
        },
        tabletRailBackButtonText: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.accent,
        },
        tabletRailSummaryCard: {
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            borderRadius: 12,
            padding: 12,
            gap: 6,
        },
        tabletRailSummaryLabel: {
            fontSize: 11,
            color: colors.textSubtle,
            textTransform: "uppercase",
            letterSpacing: 0.7,
            marginTop: 6,
        },
        tabletRailSummaryValue: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.text,
        },
        header: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surface,
        },
        backButton: {
            width: 60,
            justifyContent: "center",
            alignItems: "flex-start",
        },
        headerTitle: {
            flex: 1,
            fontSize: 18,
            fontWeight: "600",
            textAlign: "center",
            color: colors.text,
        },
        headerSpacer: {
            width: 60,
        },
        scrollContent: {
            flex: 1,
        },
        scrollContentContainer: {
            paddingBottom: 24,
        },
        scrollContentContainerTablet: {
            paddingHorizontal: 24,
            paddingTop: 20,
        },
        sectionsColumn: {
            width: "100%",
            alignSelf: "center",
        },
        section: {
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        sectionTitle: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.textSubtle,
            marginBottom: 4,
            textTransform: "uppercase",
        },
        sectionDescription: {
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 12,
        },
        settingItem: {
            marginBottom: 8,
        },
        settingInfo: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        settingLabel: {
            fontSize: 16,
            color: colors.text,
        },
        settingValue: {
            fontSize: 16,
            color: colors.textMuted,
        },
        settingDescription: {
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 4,
        },
        saveButton: {
            backgroundColor: colors.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 8,
            flex: 1,
            alignItems: "center",
        },
        saveButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        helpText: {
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 12,
        },
        linkText: {
            color: colors.link,
            textDecorationLine: "underline",
        },
        loading: {
            paddingVertical: 20,
        },
        appName: {
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 4,
            color: colors.text,
        },
        version: {
            fontSize: 14,
            color: colors.textMuted,
        },
        userInfo: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
        },
        userAvatar: {
            width: 48,
            height: 48,
            borderRadius: 24,
            marginRight: 12,
        },
        userDetails: {
            flex: 1,
        },
        userName: {
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
        },
        userEmail: {
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 2,
        },
        notSignedIn: {
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 16,
        },
        googleButton: {
            backgroundColor: colors.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 8,
            alignItems: "center",
        },
        googleButtonDisabled: {
            opacity: 0.7,
        },
        googleButtonContent: {
            flexDirection: "row",
            alignItems: "center",
        },
        googleButtonSpinner: {
            marginRight: 8,
        },
        googleButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        cloudWarning: {
            backgroundColor: colors.warningSoft,
            padding: 12,
            borderRadius: 8,
            marginTop: 12,
        },
        cloudWarningText: {
            fontSize: 14,
            color: colors.warning,
        },
        syncStatusCard: {
            backgroundColor: colors.surfaceMuted,
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
        },
        syncStatusHeader: {
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
        },
        syncStatusIndicator: {
            width: 12,
            height: 12,
            borderRadius: 6,
            marginRight: 12,
        },
        syncStatusInfo: {
            flex: 1,
        },
        syncStatusTitle: {
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
            marginBottom: 4,
        },
        syncStatusDescription: {
            fontSize: 14,
            color: colors.textMuted,
        },
        syncStatusMeta: {
            marginTop: 6,
            fontSize: 13,
            color: colors.textMuted,
        },
        enableSyncButton: {
            backgroundColor: colors.accent,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 8,
            alignItems: "center",
        },
        enableSyncButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        disableSyncButton: {
            backgroundColor: colors.danger,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 8,
            alignItems: "center",
        },
        disableSyncButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "600",
        },
        portalButton: {
            marginTop: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            alignItems: "center",
        },
        portalButtonText: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.text,
        },
        syncWarning: {
            backgroundColor: colors.warningSoft,
            padding: 12,
            borderRadius: 8,
        },
        syncWarningText: {
            fontSize: 14,
            color: colors.warning,
        },
        themeContainer: {
            flexDirection: "row",
            gap: 12,
        },
        materialYouHint: {
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 10,
            backgroundColor: colors.surfaceMuted,
        },
        materialYouHintText: {
            flex: 1,
            fontSize: 12,
            color: colors.textMuted,
        },
        themeOption: {
            flex: 1,
            padding: 16,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: colors.border,
            alignItems: "center",
            backgroundColor: colors.surfaceMuted,
        },
        themeOptionSelected: {
            borderColor: colors.accent,
            backgroundColor: colors.accentSoft,
        },
        themeIcon: {
            marginBottom: 8,
        },
        themeLabel: {
            fontSize: 14,
            fontWeight: "500",
            color: colors.text,
        },
        themeLabelSelected: {
            color: colors.accent,
            fontWeight: "600",
        },
        storageContainer: {
            marginTop: 8,
            gap: 10,
        },
        summaryRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
        },
        summaryLabel: {
            fontSize: 13,
            color: colors.textSubtle,
            textTransform: "uppercase",
            letterSpacing: 0.6,
        },
        summaryValue: {
            flex: 1,
            textAlign: "right",
            fontSize: 14,
            fontWeight: "600",
            color: colors.text,
        },
        errorText: {
            fontSize: 14,
            color: colors.danger,
        },
        storageInfoText: {
            fontSize: 14,
            color: colors.text,
        },
        storageInfoSpacing: {
            marginTop: 12,
        },
        storageComingSoon: {
            fontSize: 13,
            color: colors.textMuted,
            fontStyle: "italic",
        },
        storageInfoSubtext: {
            fontSize: 13,
            color: colors.textMuted,
        },
    });
