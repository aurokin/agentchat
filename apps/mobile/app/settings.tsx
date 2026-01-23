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
} from "react-native";
import { useRouter } from "expo-router";
import { useAppContext } from "../src/contexts/AppContext";
import { getApiKey, setApiKey, clearApiKey } from "../src/lib/storage";
import { validateApiKey } from "@shared/core/openrouter";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthContext } from "../src/lib/convex/AuthContext";

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const { syncState, setSyncState } = useAppContext();
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

    useEffect(() => {
        const loadApiKey = async () => {
            try {
                const key = await getApiKey();
                setApiKeyValue(key || "");
                if (key) {
                    setIsValidating(true);
                    const valid = await validateApiKey(key);
                    setIsValid(valid);
                }
            } finally {
                setIsLoading(false);
            }
        };
        loadApiKey();
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
            "Are you sure you want to sign out? Your local data will be preserved.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        await signOut();
                        await setSyncState("local-only");
                        Alert.alert(
                            "Signed Out",
                            "You have been signed out successfully.",
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
                                        onPress={() => {
                                            // In a real app, this would open a URL
                                        }}
                                    >
                                        openrouter.ai
                                    </Text>
                                </Text>
                            </>
                        )}
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
        marginBottom: 12,
        textTransform: "uppercase",
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
});
