import React, { useState, useEffect, type ReactElement } from "react";
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ActivityIndicator,
    ScrollView,
    Alert,
    Image,
    Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAppContext } from "../src/contexts/AppContext";
import { useSkillsContext } from "../src/contexts/SkillsContext";
import {
    getApiKey,
    setApiKey,
    clearApiKey,
    getTheme,
    setTheme,
    type UserTheme,
} from "../src/lib/storage";
import { validateApiKey } from "@shared/core/openrouter";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthContext } from "../src/lib/convex/AuthContext";
import {
    getStorageUsage,
    formatBytes,
    LOCAL_IMAGE_QUOTA,
    getLocalQuotaStatus,
} from "../src/lib/storage";

type Keybinding = {
    key: string;
    description: string;
};

const KEYBINDINGS: Keybinding[] = [
    { key: "Cmd/Ctrl + ,", description: "Open settings" },
    { key: "Cmd/Ctrl + K", description: "Focus model selector" },
    { key: "Cmd/Ctrl + /", description: "Show keyboard shortcuts" },
    { key: "Escape", description: "Close modal/dropdown" },
    { key: "Enter", description: "Send message" },
    { key: "Shift + Enter", description: "New line in message" },
];

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const { syncState, setSyncState } = useAppContext();
    const { skills, addSkill, updateSkill, deleteSkill } = useSkillsContext();
    const {
        user,
        isAuthenticated,
        isLoading: isAuthLoading,
        signIn,
        signOut,
        isConvexAvailable,
    } = useAuthContext();

    const [apiKey, setApiKeyValue] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isValidating, setIsValidating] = useState(false);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [currentTheme, setCurrentTheme] = useState<UserTheme>("system");
    const [storageUsage, setStorageUsage] = useState<{
        attachments: number;
        messages: number;
        sessions: number;
    } | null>(null);
    const [quotaStatus, setQuotaStatus] = useState<{
        used: number;
        limit: number;
    } | null>(null);
    const [isLoadingStorage, setIsLoadingStorage] = useState(true);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [key, theme] = await Promise.all([
                    getApiKey(),
                    getTheme(),
                ]);
                setApiKeyValue(key || "");
                setCurrentTheme(theme);
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
                const [usage, quota] = await Promise.all([
                    getStorageUsage(),
                    getLocalQuotaStatus(),
                ]);
                setStorageUsage(usage);
                setQuotaStatus({ used: quota.used, limit: quota.limit });
            } catch (error) {
                console.error("Failed to load storage:", error);
            } finally {
                setIsLoadingStorage(false);
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
            Alert.alert(
                "Cloud Sync Not Configured",
                "Please configure your Convex URL first to enable cloud sync.",
                [{ text: "OK" }],
            );
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
        setCurrentTheme(theme);
        await setTheme(theme);
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

    const getQuotaBarColor = () => {
        if (!quotaStatus) return "#8E8E93";
        const percentage = quotaStatus.used / quotaStatus.limit;
        if (percentage > 0.9) return "#FF3B30";
        if (percentage > 0.7) return "#FF9500";
        return "#34C759";
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.replace("/")}>
                        <Text style={styles.backButton}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Settings</Text>
                    <View style={styles.headerSpacer} />
                </View>

                <ScrollView style={styles.scrollContent}>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Account</Text>

                        {isAuthLoading ? (
                            <ActivityIndicator style={styles.loading} />
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
                                    <ActivityIndicator color="#fff" />
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
                                    Cloud sync requires Convex configuration.
                                    Add your Convex URL in the About section.
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
                                    Cloud sync requires Convex configuration.
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>OpenRouter API</Text>

                        {isLoading ? (
                            <ActivityIndicator style={styles.loading} />
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
                                        placeholderTextColor="#999"
                                        secureTextEntry
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </View>

                                {apiKey.length > 0 && (
                                    <View style={styles.validationContainer}>
                                        {isValidating ? (
                                            <ActivityIndicator size="small" />
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
                                    currentTheme === "light" &&
                                        styles.themeOptionSelected,
                                ]}
                                onPress={() => handleThemeChange("light")}
                            >
                                <Text style={styles.themeIcon}>☀️</Text>
                                <Text
                                    style={[
                                        styles.themeLabel,
                                        currentTheme === "light" &&
                                            styles.themeLabelSelected,
                                    ]}
                                >
                                    Light
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.themeOption,
                                    currentTheme === "dark" &&
                                        styles.themeOptionSelected,
                                ]}
                                onPress={() => handleThemeChange("dark")}
                            >
                                <Text style={styles.themeIcon}>🌙</Text>
                                <Text
                                    style={[
                                        styles.themeLabel,
                                        currentTheme === "dark" &&
                                            styles.themeLabelSelected,
                                    ]}
                                >
                                    Dark
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.themeOption,
                                    currentTheme === "system" &&
                                        styles.themeOptionSelected,
                                ]}
                                onPress={() => handleThemeChange("system")}
                            >
                                <Text style={styles.themeIcon}>💻</Text>
                                <Text
                                    style={[
                                        styles.themeLabel,
                                        currentTheme === "system" &&
                                            styles.themeLabelSelected,
                                    ]}
                                >
                                    System
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Image Storage</Text>
                        <Text style={styles.sectionDescription}>
                            Manage storage used by image attachments
                        </Text>

                        {isLoadingStorage ? (
                            <ActivityIndicator style={styles.loading} />
                        ) : storageUsage && quotaStatus ? (
                            <View style={styles.storageContainer}>
                                <View style={styles.storageRow}>
                                    <Text style={styles.storageLabel}>
                                        Local Image Storage
                                    </Text>
                                    <Text style={styles.storageValue}>
                                        {formatBytes(storageUsage.attachments)}{" "}
                                        / {formatBytes(LOCAL_IMAGE_QUOTA)}
                                    </Text>
                                </View>
                                <View style={styles.storageBar}>
                                    <View
                                        style={[
                                            styles.storageBarFill,
                                            {
                                                width: `${Math.min(100, (quotaStatus.used / quotaStatus.limit) * 100)}%`,
                                                backgroundColor:
                                                    getQuotaBarColor(),
                                            },
                                        ]}
                                    />
                                </View>

                                <View style={styles.statsRow}>
                                    <View style={styles.statCard}>
                                        <Text style={styles.statValue}>
                                            {formatBytes(
                                                storageUsage.attachments,
                                            )}
                                        </Text>
                                        <Text style={styles.statLabel}>
                                            Images
                                        </Text>
                                    </View>
                                    <View style={styles.statCard}>
                                        <Text style={styles.statValue}>
                                            {storageUsage.sessions}
                                        </Text>
                                        <Text style={styles.statLabel}>
                                            Conversations
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.errorText}>
                                Unable to load storage information
                            </Text>
                        )}
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

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Keybindings</Text>
                        <Text style={styles.sectionDescription}>
                            Built-in shortcuts
                        </Text>
                        <View style={styles.keybindingsList}>
                            {KEYBINDINGS.map((kb, index) => (
                                <View key={index} style={styles.keybindingRow}>
                                    <Text style={styles.keybindingKey}>
                                        {kb.key}
                                    </Text>
                                    <Text style={styles.keybindingDesc}>
                                        {kb.description}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>

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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    backButton: {
        fontSize: 16,
        color: "#007AFF",
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: "600",
        textAlign: "center",
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
        borderBottomColor: "#eee",
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#666",
        marginBottom: 4,
        textTransform: "uppercase",
    },
    sectionDescription: {
        fontSize: 14,
        color: "#888",
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
        color: "#000",
    },
    settingValue: {
        fontSize: 16,
        color: "#666",
    },
    settingDescription: {
        fontSize: 14,
        color: "#888",
        marginTop: 4,
    },
    inputContainer: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: "500",
        marginBottom: 8,
        color: "#333",
    },
    textInput: {
        borderWidth: 1,
        borderColor: "#ddd",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        backgroundColor: "#f9f9f9",
    },
    validationContainer: {
        marginBottom: 12,
    },
    validText: {
        color: "#34C759",
        fontSize: 14,
    },
    invalidText: {
        color: "#FF3B30",
        fontSize: 14,
    },
    buttonRow: {
        flexDirection: "row",
        gap: 12,
    },
    saveButton: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        flex: 1,
        alignItems: "center",
    },
    saveButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    clearButton: {
        backgroundColor: "#FF3B30",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
    },
    clearButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    helpText: {
        fontSize: 14,
        color: "#666",
        marginTop: 12,
    },
    linkText: {
        color: "#007AFF",
        textDecorationLine: "underline",
    },
    loading: {
        paddingVertical: 20,
    },
    appName: {
        fontSize: 18,
        fontWeight: "600",
        marginBottom: 4,
    },
    version: {
        fontSize: 14,
        color: "#666",
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
        color: "#000",
    },
    userEmail: {
        fontSize: 14,
        color: "#666",
        marginTop: 2,
    },
    notSignedIn: {
        fontSize: 14,
        color: "#666",
        marginBottom: 16,
    },
    googleButton: {
        backgroundColor: "#4285F4",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    googleButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    cloudWarning: {
        backgroundColor: "#FFF3CD",
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
    },
    cloudWarningText: {
        fontSize: 14,
        color: "#856404",
    },
    syncStatusCard: {
        backgroundColor: "#f5f5f5",
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
        color: "#000",
        marginBottom: 4,
    },
    syncStatusDescription: {
        fontSize: 14,
        color: "#666",
    },
    enableSyncButton: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    enableSyncButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    disableSyncButton: {
        backgroundColor: "#FF3B30",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: "center",
    },
    disableSyncButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
    },
    syncWarning: {
        backgroundColor: "#FFF3CD",
        padding: 12,
        borderRadius: 8,
    },
    syncWarningText: {
        fontSize: 14,
        color: "#856404",
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
        borderColor: "#ddd",
        alignItems: "center",
        backgroundColor: "#f9f9f9",
    },
    themeOptionSelected: {
        borderColor: "#007AFF",
        backgroundColor: "#e6f0ff",
    },
    themeIcon: {
        fontSize: 24,
        marginBottom: 8,
    },
    themeLabel: {
        fontSize: 14,
        fontWeight: "500",
        color: "#333",
    },
    themeLabelSelected: {
        color: "#007AFF",
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
        color: "#666",
    },
    storageValue: {
        fontSize: 14,
        fontWeight: "600",
        color: "#000",
    },
    storageBar: {
        height: 8,
        backgroundColor: "#e0e0e0",
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
        backgroundColor: "#f5f5f5",
        borderRadius: 8,
        alignItems: "center",
    },
    statValue: {
        fontSize: 18,
        fontWeight: "600",
        color: "#000",
    },
    statLabel: {
        fontSize: 12,
        color: "#666",
        marginTop: 4,
    },
    errorText: {
        fontSize: 14,
        color: "#FF3B30",
    },
    emptySkills: {
        padding: 24,
        backgroundColor: "#f5f5f5",
        borderRadius: 8,
        alignItems: "center",
        borderStyle: "dashed",
        borderWidth: 1,
        borderColor: "#ccc",
    },
    emptySkillsText: {
        fontSize: 14,
        color: "#666",
        marginBottom: 4,
    },
    emptySkillsSubtext: {
        fontSize: 12,
        color: "#999",
    },
    skillsList: {
        gap: 8,
    },
    skillCard: {
        padding: 12,
        backgroundColor: "#f5f5f5",
        borderRadius: 8,
    },
    skillName: {
        fontSize: 16,
        fontWeight: "500",
        color: "#000",
    },
    skillDescription: {
        fontSize: 14,
        color: "#666",
        marginTop: 4,
    },
    moreSkills: {
        fontSize: 14,
        color: "#007AFF",
        textAlign: "center",
        marginTop: 8,
    },
    keybindingsList: {
        gap: 8,
    },
    keybindingRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    keybindingKey: {
        fontSize: 14,
        fontWeight: "600",
        color: "#007AFF",
        fontFamily: "monospace",
    },
    keybindingDesc: {
        fontSize: 14,
        color: "#666",
    },
});
