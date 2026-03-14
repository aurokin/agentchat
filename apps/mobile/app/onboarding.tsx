import React, { useMemo, useState, type ReactElement } from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";
import { useAuthContext } from "@/lib/convex/AuthContext";
import { useAgent } from "@/contexts/AgentContext";

interface OnboardingScreenProps {
    onAuthenticated: () => Promise<void>;
}

export default function OnboardingScreen({
    onAuthenticated,
}: OnboardingScreenProps): ReactElement {
    const router = useRouter();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const {
        authProviderKind,
        isAuthenticated,
        isLoading: isAuthLoading,
        signIn,
        isConvexAvailable,
    } = useAuthContext();
    const { bootstrap, loadingAgents } = useAgent();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSignIn = async () => {
        if (!isConvexAvailable) {
            setError("Convex is not configured for this mobile build.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            if (authProviderKind === "local") {
                await signIn({
                    username,
                    password,
                });
            } else {
                await signIn();
            }

            await onAuthenticated();
            router.replace("/");
        } catch (signInError) {
            setError(
                signInError instanceof Error
                    ? signInError.message
                    : "Sign in failed.",
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const isBusy = loadingAgents || isAuthLoading || isSubmitting;
    const activeProviderLabel =
        authProviderKind === "local" ? "local account" : "Google";

    if (isAuthenticated && !isSubmitting) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.hero}>
                    <Text style={styles.title}>Welcome to Agentchat</Text>
                    <Text style={styles.subtitle}>
                        Sign in to access your workspace, chats, and runtime
                        activity.
                    </Text>
                </View>

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Sign in required</Text>
                    <Text style={styles.cardDescription}>
                        This instance uses {activeProviderLabel} authentication.
                        The app stays locked until you sign in.
                    </Text>

                    {authProviderKind === "local" ? (
                        <View style={styles.form}>
                            <TextInput
                                value={username}
                                onChangeText={setUsername}
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isBusy}
                                placeholder="Username"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                            />
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isBusy}
                                placeholder="Password"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                            />
                        </View>
                    ) : null}

                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}

                    <TouchableOpacity
                        style={[
                            styles.primaryButton,
                            isBusy && styles.primaryButtonDisabled,
                        ]}
                        onPress={handleSignIn}
                        disabled={isBusy}
                    >
                        {isBusy ? (
                            <View style={styles.buttonContent}>
                                <ActivityIndicator
                                    size="small"
                                    color={colors.textOnAccent}
                                />
                                <Text style={styles.primaryButtonText}>
                                    {isSubmitting
                                        ? "Signing in..."
                                        : "Loading..."}
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.primaryButtonText}>
                                {authProviderKind === "local"
                                    ? "Sign in with local user"
                                    : "Sign in with Google"}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {bootstrap?.auth.activeProvider?.id ? (
                        <Text style={styles.providerHint}>
                            Auth provider: {bootstrap.auth.activeProvider.id}
                        </Text>
                    ) : null}
                </View>
            </View>
        </SafeAreaView>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        centerContent: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
        },
        content: {
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 32,
            gap: 24,
        },
        hero: {
            gap: 10,
        },
        title: {
            fontSize: 30,
            fontWeight: "700",
            color: colors.text,
        },
        subtitle: {
            fontSize: 16,
            lineHeight: 24,
            color: colors.textMuted,
        },
        card: {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 20,
            padding: 20,
            gap: 16,
        },
        cardTitle: {
            fontSize: 20,
            fontWeight: "700",
            color: colors.text,
        },
        cardDescription: {
            fontSize: 15,
            lineHeight: 22,
            color: colors.textMuted,
        },
        form: {
            gap: 12,
        },
        input: {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            borderWidth: 1,
            borderRadius: 12,
            color: colors.text,
            fontSize: 16,
            paddingHorizontal: 14,
            paddingVertical: 14,
        },
        primaryButton: {
            alignItems: "center",
            backgroundColor: colors.accent,
            borderRadius: 12,
            paddingHorizontal: 18,
            paddingVertical: 14,
        },
        primaryButtonDisabled: {
            opacity: 0.7,
        },
        primaryButtonText: {
            color: colors.textOnAccent,
            fontSize: 16,
            fontWeight: "700",
        },
        buttonContent: {
            alignItems: "center",
            flexDirection: "row",
            gap: 10,
        },
        errorText: {
            color: colors.danger,
            fontSize: 14,
            lineHeight: 20,
        },
        providerHint: {
            color: colors.textSubtle,
            fontSize: 13,
        },
    });
