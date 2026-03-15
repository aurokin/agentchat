import React, { useEffect, type ReactElement } from "react";
import { Stack } from "expo-router";
import { ActivityIndicator, Platform, StatusBar, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { AuthProvider } from "@/lib/convex/AuthContext";
import { ConvexProvider } from "@/lib/convex";
import { ModelProvider } from "@/contexts/ModelContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AgentchatSocketProvider } from "@/contexts/AgentchatSocketContext";
import { AgentProvider, useAgent } from "@/contexts/AgentContext";
import { BackgroundRuntimeSubscriptions } from "@/components/chat/BackgroundRuntimeSubscriptions";
import OnboardingScreen from "./onboarding";
import { useAuthContext } from "@/lib/convex/AuthContext";

function LoadingScreen(): ReactElement {
    const { colors } = useTheme();

    return (
        <View
            style={{
                flex: 1,
                backgroundColor: colors.background,
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            <ActivityIndicator size="large" color={colors.accent} />
        </View>
    );
}

function RuntimeProviders(): ReactElement {
    return (
        <AgentchatSocketProvider>
            <WorkspaceProvider>
                <ModelProvider>
                    <ChatProvider>
                        <BackgroundRuntimeSubscriptions />
                        <Stack
                            screenOptions={{
                                headerShown: false,
                            }}
                        />
                    </ChatProvider>
                </ModelProvider>
            </WorkspaceProvider>
        </AgentchatSocketProvider>
    );
}

function AppShell(): ReactElement {
    const { isInitialized, hasCompletedOnboarding, completeOnboarding } =
        useAppContext();
    const { loadingAgents, authRequiresLogin } = useAgent();
    const { isAuthenticated, isLoading: isAuthLoading } = useAuthContext();

    useEffect(() => {
        if (!isAuthenticated || hasCompletedOnboarding) {
            return;
        }

        void completeOnboarding();
    }, [completeOnboarding, hasCompletedOnboarding, isAuthenticated]);

    if (!isInitialized || loadingAgents || isAuthLoading) {
        return <LoadingScreen />;
    }

    if (authRequiresLogin && !isAuthenticated) {
        return <OnboardingScreen onAuthenticated={completeOnboarding} />;
    }

    return <RuntimeProviders />;
}

function ThemedStatusBar(): React.ReactElement {
    const { scheme, colors } = useTheme();

    const androidStatusBarProps =
        Platform.OS === "android"
            ? {
                  translucent: true,
                  backgroundColor: "transparent" as const,
              }
            : {};

    return (
        <StatusBar
            barStyle={scheme === "dark" ? "light-content" : "dark-content"}
            {...androidStatusBarProps}
        />
    );
}

export default function Layout(): ReactElement {
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <ThemedStatusBar />
                <AppProvider>
                    <ConvexProvider>
                        <AgentProvider>
                            <AuthProvider>
                                <AppShell />
                            </AuthProvider>
                        </AgentProvider>
                    </ConvexProvider>
                </AppProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
