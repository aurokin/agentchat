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
    Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAppContext } from "../src/contexts/AppContext";
import { useSkillsContext } from "../src/contexts/SkillsContext";
import {
    getApiKey,
    setApiKey,
    clearApiKey,
    getLocalQuotaStatus,
    getStorageUsage,
    formatBytes,
    type UserTheme,
    type QuotaStatus,
} from "../src/lib/storage";
import { useTheme, type ThemeColors } from "../src/contexts/ThemeContext";
import { validateApiKey } from "@shared/core/openrouter";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "../src/lib/convex/AuthContext";
import { getConvexUrlOverride, getEnvConvexUrl } from "../src/lib/convex";

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const { syncState, setSyncState, initializeApp } = useAppContext();
    const { skills, addSkill, updateSkill, deleteSkill } = useSkillsContext();
    const {
        user,
        isAuthenticated,
        isLoading: isAuthLoading,
        signIn,
        signOut,
        isConvexAvailable,
        configureConvex,
        clearConvexOverride,
    } = useAuthContext();
    const { colors, userTheme, setUserTheme } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [apiKey, setApiKeyValue] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isValidating, setIsValidating] = useState(false);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [convexOverrideInput, setConvexOverrideInput] = useState("");
    const [convexOverrideSaved, setConvexOverrideSaved] = useState<
        string | null
    >(null);
    const [localQuotaStatus, setLocalQuotaStatus] =
        useState<QuotaStatus | null>(null);
    const [storageUsage, setStorageUsage] = useState<{
        attachments: number;
        messages: number;
        sessions: number;
    } | null>(null);
    const [isStorageLoading, setIsStorageLoading] = useState(true);

    const buildConvexUrl = getEnvConvexUrl();
    const convexUnavailableMessage = __DEV__
        ? "Cloud sync isn't configured for this build. Set a Convex URL in Developer settings."
        : "Cloud sync isn't configured for this build.";

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const key = await getApiKey();
                setApiKeyValue(key || "");
                const override = getConvexUrlOverride();
                setConvexOverrideSaved(override);
                setConvexOverrideInput(override ?? "");
                if (key) {
                    setIsValidating(true);
                    const valid = await validateApiKey(key);
                    setIsValid(valid);
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadSettings();
    }, []);

    useEffect(() => {
        const loadStorage = async () => {
            try {
                const [quotaStatus, usage] = await Promise.all([
                    getLocalQuotaStatus(),
                    getStorageUsage(),
                ]);
                setLocalQuotaStatus(quotaStatus);
                setStorageUsage(usage);
            } catch {
                setLocalQuotaStatus(null);
                setStorageUsage(null);
            } finally {
                setIsStorageLoading(false);
            }
        };
        loadStorage();
    }, []);

    const handleSaveApiKey = async () => {
        if (!apiKey.trim()) {
            await clearApiKey();
            setIsValid(null);
            Alert.alert("API Key Removed", "Your API key has been cleared.");
            return;
        }

        setIsValidating(true);
        try {
            const valid = await validateApiKey(apiKey);
            setIsValid(valid);

            if (valid) {
                await setApiKey(apiKey.trim());
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
            "Are you sure you want to sign out? Your local data will be preserved. Cloud data will not be deleted.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        await signOut();
                        if (syncState === "cloud-enabled") {
                            await setSyncState("cloud-disabled");
                        }
                        Alert.alert(
                            "Signed Out",
                            "You have been signed out successfully. Cloud sync is disabled but your cloud data is preserved.",
                        );
                    },
                },
            ],
        );
    };

    const handleGoogleSignIn = async () => {
        if (!isConvexAvailable) {
            Alert.alert("Cloud Sync Not Configured", convexUnavailableMessage, [
                { text: "OK" },
            ]);
            return;
        }

        try {
            await signIn();
        } catch (error) {
            Alert.alert(
                "Sign In Failed",
                "Could not sign in with Google. Please try again.",
                [{ text: "OK" }],
            );
        }
    };

    const handleClearApiKey = async () => {
        await clearApiKey();
        setApiKeyValue("");
        setIsValid(null);
        Alert.alert("API Key Cleared", "Your API key has been removed.");
    };

    const handleSaveConvexOverride = async () => {
        if (!__DEV__) {
            return;
        }
        const nextUrl = convexOverrideInput.trim();
        if (!nextUrl) {
            Alert.alert(
                "Convex URL Required",
                "Enter a valid https:// Convex URL to save an override.",
            );
            return;
        }
        try {
            await configureConvex(nextUrl);
            setConvexOverrideSaved(nextUrl);
            setConvexOverrideInput(nextUrl);
            await initializeApp();
            Alert.alert(
                "Convex Override Saved",
                "This build now uses the override Convex URL.",
            );
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Failed to save the Convex override.";
            Alert.alert("Invalid Convex URL", message);
        }
    };

    const handleClearConvexOverride = async () => {
        if (!__DEV__) {
            return;
        }
        try {
            await clearConvexOverride();
            setConvexOverrideSaved(null);
            setConvexOverrideInput("");
            await initializeApp();
            Alert.alert(
                "Convex Override Cleared",
                "Using the build-time Convex URL.",
            );
        } catch {
            Alert.alert(
                "Error",
                "Failed to clear the Convex override. Please try again.",
            );
        }
    };

    const handleEnableCloudSync = async () => {
        if (!isAuthenticated) {
            Alert.alert(
                "Sign In Required",
                "Please sign in with Google to enable cloud sync.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Sign In",
                        onPress: async () => {
                            try {
                                await signIn();
                            } catch {
                                Alert.alert(
                                    "Sign In Failed",
                                    "Could not sign in. Please try again.",
                                );
                            }
                        },
                    },
                ],
            );
            return;
        }

        try {
            await setSyncState("cloud-enabled");
            Alert.alert(
                "Cloud Sync Enabled",
                "Your chats will now sync across devices when connected to the internet.",
            );
        } catch (error) {
            Alert.alert(
                "Error",
                "Failed to enable cloud sync. Please try again.",
            );
        }
    };

    const handleDisableCloudSync = async () => {
        Alert.alert(
            "Disable Cloud Sync",
            "Your chats will no longer sync to the cloud. Your local data will be preserved.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Disable",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await setSyncState("cloud-disabled");
                            Alert.alert(
                                "Cloud Sync Disabled",
                                "Your chats are now stored only on this device.",
                            );
                        } catch (error) {
                            Alert.alert(
                                "Error",
                                "Failed to disable cloud sync. Please try again.",
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

    const getSyncStatusColor = () => {
        switch (syncState) {
            case "cloud-enabled":
                return "#34C759";
            case "cloud-disabled":
                return "#FF9500";
            default:
                return "#8E8E93";
        }
    };

    const getSyncStatusText = () => {
        switch (syncState) {
            case "cloud-enabled":
                return "Your chats sync to the cloud automatically.";
            case "cloud-disabled":
                return "Cloud sync is disabled. Your data stays on this device.";
            default:
                return "Your chats are stored only on this device.";
        }
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.replace("/")}
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

                <ScrollView style={styles.scrollContent}>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Account</Text>

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
                                Sign in to enable cloud sync across devices.
                            </Text>
                        )}

                        {isConvexAvailable && (
                            <TouchableOpacity
                                style={styles.googleButton}
                                onPress={
                                    isAuthenticated
                                        ? handleSignOut
                                        : handleGoogleSignIn
                                }
                                disabled={isAuthLoading}
                            >
                                {isAuthLoading ? (
                                    <ActivityIndicator
                                        color={colors.textOnAccent}
                                    />
                                ) : (
                                    <>
                                        <Text style={styles.googleButtonText}>
                                            {isAuthenticated
                                                ? "Sign Out"
                                                : "Sign in with Google"}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}

                        {!isConvexAvailable && (
                            <View style={styles.cloudWarning}>
                                <Text style={styles.cloudWarningText}>
                                    {convexUnavailableMessage}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Sync</Text>

                        {isConvexAvailable && (
                            <View style={styles.syncStatusCard}>
                                <View style={styles.syncStatusHeader}>
                                    <View
                                        style={[
                                            styles.syncStatusIndicator,
                                            {
                                                backgroundColor:
                                                    getSyncStatusColor(),
                                            },
                                        ]}
                                    />
                                    <View style={styles.syncStatusInfo}>
                                        <Text style={styles.syncStatusTitle}>
                                            {syncState === "cloud-enabled"
                                                ? "Cloud Sync Active"
                                                : syncState === "cloud-disabled"
                                                  ? "Cloud Sync Off"
                                                  : "Local Only"}
                                        </Text>
                                        <Text
                                            style={styles.syncStatusDescription}
                                        >
                                            {getSyncStatusText()}
                                        </Text>
                                    </View>
                                </View>

                                {syncState === "local-only" && (
                                    <TouchableOpacity
                                        style={styles.enableSyncButton}
                                        onPress={handleEnableCloudSync}
                                    >
                                        <Text
                                            style={styles.enableSyncButtonText}
                                        >
                                            Enable Cloud Sync
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {syncState === "cloud-enabled" && (
                                    <TouchableOpacity
                                        style={styles.disableSyncButton}
                                        onPress={handleDisableCloudSync}
                                    >
                                        <Text
                                            style={styles.disableSyncButtonText}
                                        >
                                            Disable Cloud Sync
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {syncState === "cloud-disabled" && (
                                    <TouchableOpacity
                                        style={styles.enableSyncButton}
                                        onPress={handleEnableCloudSync}
                                    >
                                        <Text
                                            style={styles.enableSyncButtonText}
                                        >
                                            Re-enable Cloud Sync
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        {!isConvexAvailable && (
                            <View style={styles.syncWarning}>
                                <Text style={styles.syncWarningText}>
                                    {convexUnavailableMessage}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>OpenRouter API</Text>

                        {isLoading ? (
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
                                        onChangeText={setApiKeyValue}
                                        placeholder="sk-..."
                                        placeholderTextColor={colors.textFaint}
                                        secureTextEntry
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>

                                {apiKey.length > 0 && (
                                    <View style={styles.validationContainer}>
                                        {isValidating ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={colors.accent}
                                            />
                                        ) : isValid === true ? (
                                            <Text style={styles.validText}>
                                                ✓ Valid API key
                                            </Text>
                                        ) : isValid === false ? (
                                            <Text style={styles.invalidText}>
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
                                        <Text style={styles.saveButtonText}>
                                            Save API Key
                                        </Text>
                                    </TouchableOpacity>

                                    {apiKey.length > 0 && (
                                        <TouchableOpacity
                                            style={styles.clearButton}
                                            onPress={handleClearApiKey}
                                            disabled={isValidating}
                                        >
                                            <Text
                                                style={styles.clearButtonText}
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
                        <Text style={styles.sectionTitle}>Theme</Text>
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
                                onPress={() => handleThemeChange("light")}
                            >
                                <Text style={styles.themeIcon}>☀️</Text>
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
                                onPress={() => handleThemeChange("dark")}
                            >
                                <Text style={styles.themeIcon}>🌙</Text>
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
                                onPress={() => handleThemeChange("system")}
                            >
                                <Text style={styles.themeIcon}>💻</Text>
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
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Storage</Text>

                        <View style={styles.storageContainer}>
                            {isStorageLoading ? (
                                <ActivityIndicator
                                    style={styles.loading}
                                    color={colors.accent}
                                />
                            ) : localQuotaStatus ? (
                                <>
                                    <View style={styles.storageRow}>
                                        <Text style={styles.storageLabel}>
                                            Local attachments
                                        </Text>
                                        <Text style={styles.storageValue}>
                                            {formatBytes(localQuotaStatus.used)}{" "}
                                            /{" "}
                                            {formatBytes(
                                                localQuotaStatus.limit,
                                            )}
                                        </Text>
                                    </View>
                                    <View style={styles.storageBar}>
                                        <View
                                            style={[
                                                styles.storageBarFill,
                                                {
                                                    width: `${Math.min(localQuotaStatus.percentage * 100, 100)}%`,
                                                    backgroundColor:
                                                        localQuotaStatus.isExceeded
                                                            ? colors.danger
                                                            : localQuotaStatus.isWarning80
                                                              ? colors.warning
                                                              : colors.success,
                                                },
                                            ]}
                                        />
                                    </View>
                                    {storageUsage && (
                                        <View style={styles.statsRow}>
                                            <View style={styles.statCard}>
                                                <Text style={styles.statValue}>
                                                    {storageUsage.sessions}
                                                </Text>
                                                <Text style={styles.statLabel}>
                                                    Chats
                                                </Text>
                                            </View>
                                            <View style={styles.statCard}>
                                                <Text style={styles.statValue}>
                                                    {storageUsage.messages}
                                                </Text>
                                                <Text style={styles.statLabel}>
                                                    Messages
                                                </Text>
                                            </View>
                                        </View>
                                    )}
                                </>
                            ) : null}

                            {syncState === "cloud-enabled" && (
                                <Text
                                    style={[
                                        styles.storageInfoText,
                                        localQuotaStatus &&
                                            styles.storageInfoSpacing,
                                    ]}
                                >
                                    Your attachments are stored in the cloud and
                                    sync across devices.
                                </Text>
                            )}

                            {syncState === "cloud-enabled" && (
                                <Text style={styles.storageComingSoon}>
                                    Cloud storage management coming soon.
                                </Text>
                            )}

                            {syncState !== "cloud-enabled" && (
                                <>
                                    <Text
                                        style={[
                                            styles.storageInfoText,
                                            localQuotaStatus &&
                                                styles.storageInfoSpacing,
                                        ]}
                                    >
                                        Your chats and attachments are stored
                                        only on this device.
                                    </Text>
                                    <Text style={styles.storageInfoSubtext}>
                                        Enable cloud sync to access your data
                                        across devices.
                                    </Text>
                                </>
                            )}
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Skills</Text>
                        <Text style={styles.sectionDescription}>
                            Create reusable prompt templates
                        </Text>

                        {skills.length === 0 ? (
                            <View style={styles.emptySkills}>
                                <Text style={styles.emptySkillsText}>
                                    No skills created yet
                                </Text>
                                <Text style={styles.emptySkillsSubtext}>
                                    Skills you create will appear here
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.skillsList}>
                                {skills.slice(0, 3).map((skill) => (
                                    <View
                                        key={skill.id}
                                        style={styles.skillCard}
                                    >
                                        <Text style={styles.skillName}>
                                            {skill.name}
                                        </Text>
                                        {skill.description && (
                                            <Text
                                                style={styles.skillDescription}
                                            >
                                                {skill.description}
                                            </Text>
                                        )}
                                    </View>
                                ))}
                                {skills.length > 3 && (
                                    <Text style={styles.moreSkills}>
                                        +{skills.length - 3} more skills
                                    </Text>
                                )}
                            </View>
                        )}
                    </View>

                    {__DEV__ && (
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Developer</Text>
                            <Text style={styles.sectionDescription}>
                                Override the Convex URL for local testing
                            </Text>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>
                                    Convex URL Override
                                </Text>
                                <TextInput
                                    style={styles.textInput}
                                    value={convexOverrideInput}
                                    onChangeText={setConvexOverrideInput}
                                    placeholder={
                                        buildConvexUrl ??
                                        "https://your-deployment.convex.cloud"
                                    }
                                    placeholderTextColor={colors.textFaint}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                            <Text style={styles.helpText}>
                                {convexOverrideSaved
                                    ? `Active override: ${convexOverrideSaved}`
                                    : buildConvexUrl
                                      ? `Build URL: ${buildConvexUrl}`
                                      : "No build-time Convex URL configured."}
                            </Text>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={styles.saveButton}
                                    onPress={handleSaveConvexOverride}
                                >
                                    <Text style={styles.saveButtonText}>
                                        Save Override
                                    </Text>
                                </TouchableOpacity>
                                {convexOverrideSaved && (
                                    <TouchableOpacity
                                        style={styles.clearButton}
                                        onPress={handleClearConvexOverride}
                                    >
                                        <Text style={styles.clearButtonText}>
                                            Clear Override
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>About</Text>
                        <View style={styles.settingItem}>
                            <Text style={styles.appName}>RouterChat</Text>
                            <Text style={styles.version}>Version 1.0.0</Text>
                        </View>
                        <Text style={styles.settingDescription}>
                            An offline-first chat app powered by OpenRouter.
                        </Text>
                    </View>
                </ScrollView>
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
            fontSize: 24,
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
        moreSkills: {
            fontSize: 14,
            color: colors.accent,
            textAlign: "center",
            marginTop: 8,
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
