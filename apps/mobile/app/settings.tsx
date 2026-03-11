import React, { useState, useEffect, useMemo, type ReactElement } from "react";
import {
    View,
    Text,
    TextInput,
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
import { useSync } from "@/contexts/SyncContext";
import { formatBytes, type UserTheme } from "@/lib/storage";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { validateApiKey } from "@shared/core/openrouter";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "@/lib/convex/AuthContext";
import { useApiKey } from "@/hooks/useApiKey";

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const {
        syncState,
        clearCloudImages,
        refreshQuotaStatus,
        cloudQuotaStatus,
        cloudStorageUsage,
    } = useSync();
    const {
        user,
        isAuthenticated,
        isLoading: isAuthLoading,
        signIn,
        signOut,
        isConvexAvailable,
    } = useAuthContext();
    const { colors, userTheme, setUserTheme, isMaterialYouActive } = useTheme();
    const {
        apiKey: storedApiKey,
        isLoading: isApiKeyLoading,
        setApiKey: persistApiKey,
        clearApiKey: removeApiKey,
        isCloudSynced,
    } = useApiKey();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [apiKey, setApiKeyValue] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);

    const convexUnavailableMessage = "Convex isn't configured for this build.";

    useEffect(() => {
        if (isApiKeyLoading) return;
        const key = storedApiKey ?? "";
        setApiKeyValue(key);
        if (key) {
            setIsValidating(true);
            validateApiKey(key)
                .then((valid) => setIsValid(valid))
                .finally(() => setIsValidating(false));
        } else {
            setIsValid(null);
        }
    }, [isApiKeyLoading, storedApiKey]);

    useEffect(() => {
        void refreshQuotaStatus();
    }, [refreshQuotaStatus]);

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) {
            await removeApiKey();
            setIsValid(null);
            Alert.alert("API Key Removed", "Your API key has been cleared.");
            return;
        }

        setIsValidating(true);
        try {
            const valid = await validateApiKey(apiKey);
            setIsValid(valid);

            if (valid) {
                await persistApiKey(apiKey.trim());
                Alert.alert(
                    "API Key Saved",
                    "Your OpenRouter API key has been saved.",
                );
            } else {
                Alert.alert(
                    "Invalid API Key",
                    "The API key you entered is not valid. Please check and try again.",
                );
            }
        } catch {
            setIsValid(false);
            Alert.alert(
                "Validation Error",
                "Could not validate your API key. Please check your connection and try again.",
            );
        } finally {
            setIsValidating(false);
        }
    };

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

    const handleClearApiKey = async () => {
        await removeApiKey();
        setApiKeyValue("");
        setIsValid(null);
        Alert.alert("API Key Cleared", "Your API key has been removed.");
    };

    const handleClearCloudImages = async () => {
        Alert.alert(
            "Clear Workspace Images",
            "This will delete all synced attachments from your Convex workspace. Your chats will remain.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await clearCloudImages();
                            Alert.alert(
                                "Workspace Images Cleared",
                                "Your synced attachments have been removed.",
                            );
                        } catch {
                            Alert.alert(
                                "Clear Failed",
                                "Could not clear cloud images. Please try again.",
                            );
                        }
                    },
                },
            ],
        );
    };

    const handleThemeChange = async (theme: UserTheme) => {
        await setUserTheme(theme);
    };
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
                                    Workspace
                                </Text>
                                <Text style={styles.tabletRailSummaryValue}>
                                    {syncState === "cloud-enabled"
                                        ? "Connected"
                                        : "Signed out"}
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
                                        OpenRouter API
                                    </Text>

                                    {isApiKeyLoading ? (
                                        <ActivityIndicator
                                            style={styles.loading}
                                            color={colors.accent}
                                        />
                                    ) : (
                                        <>
                                            <View style={styles.inputContainer}>
                                                <Text style={styles.inputLabel}>
                                                    API Key
                                                </Text>
                                                <TextInput
                                                    style={styles.textInput}
                                                    value={apiKey}
                                                    onChangeText={
                                                        setApiKeyValue
                                                    }
                                                    placeholder="sk-..."
                                                    placeholderTextColor={
                                                        colors.textFaint
                                                    }
                                                    secureTextEntry
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                />
                                                {isCloudSynced && (
                                                    <Text
                                                        style={
                                                            styles.apiKeyStorageText
                                                        }
                                                    >
                                                        Stored in Convex
                                                    </Text>
                                                )}
                                            </View>

                                            {apiKey.length > 0 && (
                                                <View
                                                    style={
                                                        styles.validationContainer
                                                    }
                                                >
                                                    {isValidating ? (
                                                        <ActivityIndicator
                                                            size="small"
                                                            color={
                                                                colors.accent
                                                            }
                                                        />
                                                    ) : isValid === true ? (
                                                        <Text
                                                            style={
                                                                styles.validText
                                                            }
                                                        >
                                                            ✓ Valid API key
                                                        </Text>
                                                    ) : isValid === false ? (
                                                        <Text
                                                            style={
                                                                styles.invalidText
                                                            }
                                                        >
                                                            ✗ Invalid API key
                                                        </Text>
                                                    ) : null}
                                                </View>
                                            )}

                                            <View style={styles.buttonRow}>
                                                <TouchableOpacity
                                                    style={styles.saveButton}
                                                    onPress={handleSaveApiKey}
                                                    disabled={isValidating}
                                                >
                                                    <Text
                                                        style={
                                                            styles.saveButtonText
                                                        }
                                                    >
                                                        Save API Key
                                                    </Text>
                                                </TouchableOpacity>

                                                {apiKey.length > 0 && (
                                                    <TouchableOpacity
                                                        style={
                                                            styles.clearButton
                                                        }
                                                        onPress={
                                                            handleClearApiKey
                                                        }
                                                        disabled={isValidating}
                                                    >
                                                        <Text
                                                            style={
                                                                styles.clearButtonText
                                                            }
                                                        >
                                                            Clear
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>

                                            <Text style={styles.helpText}>
                                                Get your API key from{" "}
                                                <Text
                                                    style={styles.linkText}
                                                    onPress={() => {}}
                                                >
                                                    openrouter.ai
                                                </Text>
                                            </Text>
                                        </>
                                    )}
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
                                        Storage
                                    </Text>

                                    <View style={styles.storageContainer}>
                                        {isAuthenticated &&
                                        syncState === "cloud-enabled" &&
                                        cloudQuotaStatus &&
                                        cloudStorageUsage ? (
                                            <>
                                                <View style={styles.storageRow}>
                                                    <Text
                                                        style={
                                                            styles.storageLabel
                                                        }
                                                    >
                                                        Workspace attachments
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.storageValue
                                                        }
                                                    >
                                                        {formatBytes(
                                                            cloudQuotaStatus.used,
                                                        )}{" "}
                                                        /{" "}
                                                        {formatBytes(
                                                            cloudQuotaStatus.limit,
                                                        )}
                                                    </Text>
                                                </View>
                                                <View style={styles.storageBar}>
                                                    <View
                                                        style={[
                                                            styles.storageBarFill,
                                                            {
                                                                width: `${Math.min(cloudQuotaStatus.percentage * 100, 100)}%`,
                                                                backgroundColor:
                                                                    cloudQuotaStatus.isExceeded
                                                                        ? colors.danger
                                                                        : cloudQuotaStatus.isWarning80
                                                                          ? colors.warning
                                                                          : colors.success,
                                                            },
                                                        ]}
                                                    />
                                                </View>
                                                <View style={styles.statsRow}>
                                                    <View
                                                        style={styles.statCard}
                                                    >
                                                        <Text
                                                            style={
                                                                styles.statValue
                                                            }
                                                        >
                                                            {
                                                                cloudStorageUsage.sessionCount
                                                            }
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.statLabel
                                                            }
                                                        >
                                                            Chats
                                                        </Text>
                                                    </View>
                                                    <View
                                                        style={styles.statCard}
                                                    >
                                                        <Text
                                                            style={
                                                                styles.statValue
                                                            }
                                                        >
                                                            {
                                                                cloudStorageUsage.messageCount
                                                            }
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.statLabel
                                                            }
                                                        >
                                                            Messages
                                                        </Text>
                                                    </View>
                                                </View>
                                            </>
                                        ) : null}

                                        {syncState === "cloud-enabled" && (
                                            <Text
                                                style={styles.storageInfoText}
                                            >
                                                Your attachments are stored in
                                                Convex and available on every
                                                signed-in device.
                                            </Text>
                                        )}

                                        {syncState === "cloud-enabled" && (
                                            <View style={styles.buttonRow}>
                                                <TouchableOpacity
                                                    style={styles.clearButton}
                                                    onPress={
                                                        handleClearCloudImages
                                                    }
                                                    disabled={false}
                                                >
                                                    <Text
                                                        style={
                                                            styles.clearButtonText
                                                        }
                                                    >
                                                        Clear Workspace Images
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}

                                        {syncState !== "cloud-enabled" && (
                                            <Text
                                                style={styles.storageInfoText}
                                            >
                                                Sign in to inspect workspace
                                                storage usage for this
                                                deployment.
                                            </Text>
                                        )}
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
                                        OpenRouter and Convex.
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
        inputContainer: {
            marginBottom: 12,
        },
        inputLabel: {
            fontSize: 14,
            fontWeight: "500",
            marginBottom: 8,
            color: colors.text,
        },
        apiKeyStorageText: {
            marginTop: 6,
            fontSize: 12,
            color: colors.textMuted,
        },
        textInput: {
            borderWidth: 1,
            borderColor: colors.inputBorder,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 16,
            backgroundColor: colors.inputBackground,
            color: colors.text,
        },
        validationContainer: {
            marginBottom: 12,
        },
        validText: {
            color: colors.success,
            fontSize: 14,
        },
        invalidText: {
            color: colors.danger,
            fontSize: 14,
        },
        buttonRow: {
            flexDirection: "row",
            gap: 12,
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
        clearButton: {
            backgroundColor: colors.danger,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 8,
        },
        clearButtonText: {
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
        },
        storageRow: {
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 8,
        },
        storageSectionSpacing: {
            marginTop: 16,
        },
        storageLabel: {
            fontSize: 14,
            color: colors.textMuted,
        },
        storageValue: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.text,
        },
        storageBar: {
            height: 8,
            backgroundColor: colors.borderMuted,
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 16,
        },
        storageBarFill: {
            height: "100%",
            borderRadius: 4,
        },
        statsRow: {
            flexDirection: "row",
            gap: 12,
        },
        statCard: {
            flex: 1,
            padding: 12,
            backgroundColor: colors.surfaceMuted,
            borderRadius: 8,
            alignItems: "center",
        },
        statValue: {
            fontSize: 18,
            fontWeight: "600",
            color: colors.text,
        },
        statLabel: {
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 4,
        },
        errorText: {
            fontSize: 14,
            color: colors.danger,
        },
        sectionHeaderRow: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
        },
        skillHeaderButton: {
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: colors.accent,
        },
        skillHeaderButtonText: {
            fontSize: 14,
            fontWeight: "600",
            color: colors.textOnAccent,
        },
        skillForm: {
            padding: 12,
            borderRadius: 10,
            backgroundColor: colors.surfaceMuted,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: 12,
        },
        skillFormHeader: {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
        },
        skillFormTitle: {
            fontSize: 16,
            fontWeight: "600",
            color: colors.text,
        },
        skillIconButton: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surface,
        },
        promptInput: {
            minHeight: 120,
        },
        skillFormActions: {
            flexDirection: "row",
            gap: 12,
        },
        skillSaveButton: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 10,
            borderRadius: 8,
            backgroundColor: colors.accent,
        },
        skillSaveButtonDisabled: {
            opacity: 0.5,
        },
        skillSaveButtonText: {
            color: colors.textOnAccent,
            fontSize: 15,
            fontWeight: "600",
        },
        skillCancelButton: {
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        skillCancelButtonText: {
            color: colors.text,
            fontSize: 15,
            fontWeight: "600",
        },
        emptySkills: {
            padding: 24,
            backgroundColor: colors.surfaceMuted,
            borderRadius: 8,
            alignItems: "center",
            borderStyle: "dashed",
            borderWidth: 1,
            borderColor: colors.border,
        },
        emptySkillsText: {
            fontSize: 14,
            color: colors.textMuted,
            marginBottom: 4,
        },
        emptySkillsSubtext: {
            fontSize: 12,
            color: colors.textFaint,
        },
        skillsList: {
            gap: 8,
        },
        skillCard: {
            padding: 12,
            backgroundColor: colors.surfaceMuted,
            borderRadius: 8,
        },
        skillCardHeader: {
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
        },
        skillCardBody: {
            flex: 1,
            gap: 4,
        },
        skillName: {
            fontSize: 16,
            fontWeight: "500",
            color: colors.text,
        },
        skillDescription: {
            fontSize: 14,
            color: colors.textMuted,
            marginTop: 4,
        },
        skillPromptPreview: {
            fontSize: 12,
            color: colors.textFaint,
            marginTop: 6,
        },
        skillActions: {
            flexDirection: "row",
            gap: 6,
        },
        skillActionButton: {
            width: 32,
            height: 32,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
        },
        storageInfoText: {
            fontSize: 14,
            color: colors.text,
            marginBottom: 8,
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
