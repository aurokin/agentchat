import type { ReactElement } from "react";
import { Stack } from "expo-router";
import { Platform, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "@/contexts/AppContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { AuthProvider } from "@/lib/convex/AuthContext";
import { ConvexProvider } from "@/lib/convex";
import { ModelProvider } from "@/contexts/ModelContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AgentchatSocketProvider } from "@/contexts/AgentchatSocketContext";
import { AgentProvider } from "@/contexts/AgentContext";
import OnboardingScreen from "./onboarding";

function RuntimeProviders(): ReactElement {
    return (
        <ConvexProvider>
            <AgentProvider>
                <AuthProvider>
                    <AgentchatSocketProvider>
                        <ModelProvider>
                            <WorkspaceProvider>
                                <ChatProvider>
                                    <Stack
                                        screenOptions={{
                                            headerShown: false,
                                        }}
                                    />
                                </ChatProvider>
                            </WorkspaceProvider>
                        </ModelProvider>
                    </AgentchatSocketProvider>
                </AuthProvider>
            </AgentProvider>
        </ConvexProvider>
    );
}

function AppShell(): ReactElement {
    const { isInitialized, hasCompletedOnboarding, completeOnboarding } =
        useAppContext();
    const shouldShowOnboarding = isInitialized && !hasCompletedOnboarding;

    const handleOnboardingComplete = async () => {
        await completeOnboarding();
    };

    if (shouldShowOnboarding) {
        return <OnboardingScreen onComplete={handleOnboardingComplete} />;
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
                    <AppShell />
                </AppProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
