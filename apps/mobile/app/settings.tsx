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
    Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSync } from "@/contexts/SyncContext";
import { useSkillsContext } from "@/contexts/SkillsContext";
import { formatBytes, getStorageUsage, type UserTheme } from "@/lib/storage";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { validateApiKey } from "@shared/core/openrouter";
import type { Skill } from "@shared/core/skills";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useAuthContext } from "@/lib/convex/AuthContext";
import { getConvexUrlOverride, getEnvConvexUrl } from "@/lib/convex";
import { useApiKey } from "@/hooks/useApiKey";
import { useSubscription } from "@/hooks/useSubscription";

export default function SettingsScreen(): ReactElement {
    const router = useRouter();
    const {
        syncState,
        enableCloudSync,
        disableCloudSync,
        cloneToLocal,
        clearCloudImages,
        refreshQuotaStatus,
        localQuotaStatus,
        cloudQuotaStatus,
        cloudStorageUsage,
        isMigrating,
        migrationProgress,
        isCloning,
        cloneProgress,
        refreshSyncState,
    } = useSync();
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
    const {
        status: subscription,
        isLoading: isSubscriptionLoading,
        openPortal,
    } = useSubscription();
    const {
        apiKey: storedApiKey,
        isLoading: isApiKeyLoading,
        setApiKey: persistApiKey,
        clearApiKey: removeApiKey,
        isCloudSynced,
    } = useApiKey();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [apiKey, setApiKeyValue] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [isValid, setIsValid] = useState<boolean | null>(null);
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [convexOverrideInput, setConvexOverrideInput] = useState("");
    const [convexOverrideSaved, setConvexOverrideSaved] = useState<
        string | null
    >(null);
    const [storageUsage, setStorageUsage] = useState<{
        attachments: number;
        messages: number;
        sessions: number;
    } | null>(null);
    const [isStorageLoading, setIsStorageLoading] = useState(true);
    const [showSkillForm, setShowSkillForm] = useState(false);
    const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
    const [skillName, setSkillName] = useState("");
    const [skillDescription, setSkillDescription] = useState("");
    const [skillPrompt, setSkillPrompt] = useState("");

    const buildConvexUrl = getEnvConvexUrl();
    const convexUnavailableMessage = __DEV__
        ? "Cloud sync isn't configured for this build. Set a Convex URL in Developer settings."
        : "Cloud sync isn't configured for this build.";

    useEffect(() => {
        if (isApiKeyLoading) return;
        const override = getConvexUrlOverride();
        setConvexOverrideSaved(override);
        setConvexOverrideInput(override ?? "");

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
        const loadStorage = async () => {
            try {
                const usage = await getStorageUsage();
                setStorageUsage(usage);
                await refreshQuotaStatus();
            } catch {
                setStorageUsage(null);
            } finally {
                setIsStorageLoading(false);
            }
        };
        loadStorage();
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
            "Are you sure you want to sign out? Your local data will be preserved. Cloud data will not be deleted.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: async () => {
                        if (syncState === "cloud-enabled") {
                            try {
                                await disableCloudSync();
                            } catch {}
                        }
                        await signOut();
                        Alert.alert(
                            "Signed Out",
                            "You have been signed out successfully. Cloud sync is disabled but your cloud data is preserved.",
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
            Alert.alert("Cloud Sync Not Configured", convexUnavailableMessage, [
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
            await refreshSyncState();
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
            await refreshSyncState();
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
        if (!isConvexAvailable) {
            Alert.alert("Cloud Sync Not Configured", convexUnavailableMessage, [
                { text: "OK" },
            ]);
            return;
        }

        if (!isAuthenticated) {
            Alert.alert(
                "Sign In Required",
                "Please sign in with Google to enable cloud sync.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Sign In",
                        onPress: async () => {
                            await performSignIn();
                        },
                    },
                ],
            );
            return;
        }

        if (isSubscriptionLoading) {
            Alert.alert(
                "Checking Subscription",
                "Please wait while we verify your subscription.",
            );
            return;
        }

        if (subscription?.hasCloudSync === false) {
            Alert.alert(
                "Subscription Required",
                "Cloud sync requires a RouterChat Pro subscription.",
                openPortal
                    ? [
                          { text: "Cancel", style: "cancel" },
                          {
                              text: "Manage Subscription",
                              onPress: async () => {
                                  const portalUrl = await openPortal();
                                  if (portalUrl) {
                                      await Linking.openURL(portalUrl);
                                  }
                              },
                          },
                      ]
                    : [{ text: "OK" }],
            );
            return;
        }

        try {
            await enableCloudSync();
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
                            await disableCloudSync();
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

    const handleOpenPortal = async () => {
        const portalUrl = await openPortal();
        if (!portalUrl) {
            Alert.alert(
                "Portal Unavailable",
                "Subscription management is not available right now.",
            );
            return;
        }
        await Linking.openURL(portalUrl);
    };

    const handleCloneToLocal = async () => {
        Alert.alert(
            "Clone Cloud Data",
            "This will copy your cloud chats and attachments to this device.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clone",
                    onPress: async () => {
                        try {
                            await cloneToLocal();
                            Alert.alert(
                                "Clone Complete",
                                "Your cloud data has been copied to this device.",
                            );
                        } catch {
                            Alert.alert(
                                "Clone Failed",
                                "Could not clone cloud data. Please try again.",
                            );
                        }
                    },
                },
            ],
        );
    };

    const handleClearCloudImages = async () => {
        Alert.alert(
            "Clear Cloud Images",
            "This will delete all cloud attachments. Your chats will remain.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Clear",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await clearCloudImages();
                            Alert.alert(
                                "Cloud Images Cleared",
                                "Your cloud attachments have been removed.",
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

    const resetSkillForm = () => {
        setSkillName("");
        setSkillDescription("");
        setSkillPrompt("");
        setEditingSkillId(null);
    };

    const openNewSkillForm = () => {
        resetSkillForm();
        setShowSkillForm(true);
    };

    const openEditSkillForm = (skill: Skill) => {
        setSkillName(skill.name);
        setSkillDescription(skill.description);
        setSkillPrompt(skill.prompt);
        setEditingSkillId(skill.id);
        setShowSkillForm(true);
    };

    const closeSkillForm = () => {
        setShowSkillForm(false);
        resetSkillForm();
    };

    const handleSaveSkill = () => {
        const trimmedName = skillName.trim();
        const trimmedPrompt = skillPrompt.trim();
        if (!trimmedName || !trimmedPrompt) {
            return;
        }

        const payload = {
            name: trimmedName,
            description: skillDescription.trim(),
            prompt: trimmedPrompt,
        };

        if (editingSkillId) {
            updateSkill(editingSkillId, payload);
        } else {
            addSkill(payload);
        }

        closeSkillForm();
    };

    const handleDeleteSkill = (skill: Skill) => {
        Alert.alert(
            "Delete Skill",
            `Delete "${skill.name}"? This cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        deleteSkill(skill.id);
                        if (editingSkillId === skill.id) {
                            closeSkillForm();
                        }
                    },
                },
            ],
        );
    };

    const isSkillValid =
        skillName.trim().length > 0 && skillPrompt.trim().length > 0;
    const hasCloudSync = subscription?.hasCloudSync ?? false;
    const syncActionDisabled = isMigrating || isCloning;
    const isGoogleButtonBusy = isAuthLoading || isSigningIn;

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
                                    <View style={styles.googleButtonContent}>
                                        <ActivityIndicator
                                            color={colors.textOnAccent}
                                            style={styles.googleButtonSpinner}
                                        />
                                        <Text style={styles.googleButtonText}>
                                            {isSigningIn
                                                ? "Signing in..."
                                                : "Loading..."}
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.googleButtonText}>
                                        {isAuthenticated
                                            ? "Sign Out"
                                            : "Sign in with Google"}
                                    </Text>
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
                                        {isSubscriptionLoading && (
                                            <Text style={styles.syncStatusMeta}>
                                                Checking subscription...
                                            </Text>
                                        )}
                                        {!isSubscriptionLoading &&
                                            isAuthenticated &&
                                            !hasCloudSync && (
                                                <Text
                                                    style={
                                                        styles.syncStatusMeta
                                                    }
                                                >
                                                    Cloud sync requires
                                                    RouterChat Pro.
                                                </Text>
                                            )}
                                        {isMigrating && migrationProgress && (
                                            <Text style={styles.syncStatusMeta}>
                                                Migrating...{" "}
                                                {Math.round(
                                                    migrationProgress.percentage,
                                                )}
                                                %
                                            </Text>
                                        )}
                                        {isCloning && cloneProgress && (
                                            <Text style={styles.syncStatusMeta}>
                                                Cloning...{" "}
                                                {Math.round(
                                                    cloneProgress.percentage,
                                                )}
                                                %
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {syncState === "local-only" && (
                                    <TouchableOpacity
                                        style={styles.enableSyncButton}
                                        onPress={handleEnableCloudSync}
                                        disabled={syncActionDisabled}
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
                                        disabled={syncActionDisabled}
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
                                        disabled={syncActionDisabled}
                                    >
                                        <Text
                                            style={styles.enableSyncButtonText}
                                        >
                                            Re-enable Cloud Sync
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                {isAuthenticated && !hasCloudSync && (
                                    <TouchableOpacity
                                        style={styles.portalButton}
                                        onPress={handleOpenPortal}
                                    >
                                        <Text style={styles.portalButtonText}>
                                            Manage Subscription
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
                                        onChangeText={setApiKeyValue}
                                        placeholder="sk-..."
                                        placeholderTextColor={colors.textFaint}
                                        secureTextEntry
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    {isCloudSynced && (
                                        <Text style={styles.apiKeyStorageText}>
                                            Stored in cloud sync
                                        </Text>
                                    )}
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
                                onPress={() => handleThemeChange("dark")}
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
                                onPress={() => handleThemeChange("system")}
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
                                    {cloudQuotaStatus && (
                                        <>
                                            <View style={styles.storageRow}>
                                                <Text
                                                    style={styles.storageLabel}
                                                >
                                                    Cloud attachments
                                                </Text>
                                                <Text
                                                    style={styles.storageValue}
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
                                            {cloudStorageUsage && (
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
                                                            Cloud Chats
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
                                                            Cloud Messages
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                        </>
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
                                <View style={styles.buttonRow}>
                                    <TouchableOpacity
                                        style={styles.saveButton}
                                        onPress={handleCloneToLocal}
                                        disabled={syncActionDisabled}
                                    >
                                        <Text style={styles.saveButtonText}>
                                            Clone to Local
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.clearButton}
                                        onPress={handleClearCloudImages}
                                        disabled={syncActionDisabled}
                                    >
                                        <Text style={styles.clearButtonText}>
                                            Clear Cloud Images
                                        </Text>
                                    </TouchableOpacity>
                                </View>
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
                        <View style={styles.sectionHeaderRow}>
                            <Text style={styles.sectionTitle}>Skills</Text>
                            <TouchableOpacity
                                style={styles.skillHeaderButton}
                                onPress={openNewSkillForm}
                                accessibilityLabel="New skill"
                            >
                                <Feather
                                    name="plus"
                                    size={16}
                                    color={colors.textOnAccent}
                                />
                                <Text style={styles.skillHeaderButtonText}>
                                    New Skill
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>
                            Create reusable prompt templates
                        </Text>

                        {showSkillForm && (
                            <View style={styles.skillForm}>
                                <View style={styles.skillFormHeader}>
                                    <Text style={styles.skillFormTitle}>
                                        {editingSkillId
                                            ? "Edit Skill"
                                            : "New Skill"}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={closeSkillForm}
                                        style={styles.skillIconButton}
                                        accessibilityLabel="Close skill form"
                                    >
                                        <Feather
                                            name="x"
                                            size={16}
                                            color={colors.textMuted}
                                        />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputLabel}>Name</Text>
                                    <TextInput
                                        style={styles.textInput}
                                        value={skillName}
                                        onChangeText={setSkillName}
                                        placeholder="e.g., Code Reviewer"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputLabel}>
                                        Description (optional)
                                    </Text>
                                    <TextInput
                                        style={styles.textInput}
                                        value={skillDescription}
                                        onChangeText={setSkillDescription}
                                        placeholder="Short summary"
                                        placeholderTextColor={colors.textFaint}
                                    />
                                </View>
                                <View style={styles.inputContainer}>
                                    <Text style={styles.inputLabel}>
                                        Prompt
                                    </Text>
                                    <TextInput
                                        style={[
                                            styles.textInput,
                                            styles.promptInput,
                                        ]}
                                        value={skillPrompt}
                                        onChangeText={setSkillPrompt}
                                        placeholder="You are an expert reviewer..."
                                        placeholderTextColor={colors.textFaint}
                                        multiline
                                        textAlignVertical="top"
                                    />
                                </View>
                                <View style={styles.skillFormActions}>
                                    <TouchableOpacity
                                        style={[
                                            styles.skillSaveButton,
                                            !isSkillValid &&
                                                styles.skillSaveButtonDisabled,
                                        ]}
                                        onPress={handleSaveSkill}
                                        disabled={!isSkillValid}
                                    >
                                        <Feather
                                            name="check"
                                            size={16}
                                            color={colors.textOnAccent}
                                        />
                                        <Text
                                            style={styles.skillSaveButtonText}
                                        >
                                            {editingSkillId
                                                ? "Update"
                                                : "Create"}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.skillCancelButton}
                                        onPress={closeSkillForm}
                                    >
                                        <Feather
                                            name="x"
                                            size={16}
                                            color={colors.textOnAccent}
                                        />
                                        <Text
                                            style={styles.skillCancelButtonText}
                                        >
                                            Cancel
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

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
                                {skills.map((skill) => (
                                    <View
                                        key={skill.id}
                                        style={styles.skillCard}
                                    >
                                        <View style={styles.skillCardHeader}>
                                            <View style={styles.skillCardBody}>
                                                <Text
                                                    style={styles.skillName}
                                                    numberOfLines={1}
                                                >
                                                    {skill.name}
                                                </Text>
                                                {skill.description ? (
                                                    <Text
                                                        style={
                                                            styles.skillDescription
                                                        }
                                                        numberOfLines={1}
                                                    >
                                                        {skill.description}
                                                    </Text>
                                                ) : null}
                                                <Text
                                                    style={
                                                        styles.skillPromptPreview
                                                    }
                                                    numberOfLines={2}
                                                >
                                                    {skill.prompt}
                                                </Text>
                                            </View>
                                            <View style={styles.skillActions}>
                                                <TouchableOpacity
                                                    onPress={() =>
                                                        openEditSkillForm(skill)
                                                    }
                                                    style={
                                                        styles.skillActionButton
                                                    }
                                                    accessibilityLabel={`Edit ${skill.name}`}
                                                >
                                                    <Feather
                                                        name="edit-2"
                                                        size={16}
                                                        color={colors.textMuted}
                                                    />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() =>
                                                        handleDeleteSkill(skill)
                                                    }
                                                    style={
                                                        styles.skillActionButton
                                                    }
                                                    accessibilityLabel={`Delete ${skill.name}`}
                                                >
                                                    <Feather
                                                        name="trash-2"
                                                        size={16}
                                                        color={colors.danger}
                                                    />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                ))}
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
