import type { ReactElement, ReactNode } from "react";
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
import { ShareIntentBridge } from "@/components/share/ShareIntentBridge";
import { AgentProvider } from "@/contexts/AgentContext";
import OnboardingScreen from "./onboarding";

function OnboardingWrapper({
    children,
}: {
    children: ReactNode;
}): ReactElement {
    const { isInitialized, hasCompletedOnboarding, completeOnboarding } =
        useAppContext();
    const shouldShowOnboarding = isInitialized && !hasCompletedOnboarding;

    const handleOnboardingComplete = async () => {
        await completeOnboarding();
    };

    if (shouldShowOnboarding) {
        return <OnboardingScreen onComplete={handleOnboardingComplete} />;
    }

    return <>{children}</>;
}

function ThemedStatusBar(): React.ReactElement {
    const { scheme, colors } = useTheme();

    return (
        <StatusBar
            barStyle={scheme === "dark" ? "light-content" : "dark-content"}
            translucent={Platform.OS === "android"}
            backgroundColor={
                Platform.OS === "android" ? "transparent" : colors.background
            }
        />
    );
}

export default function Layout(): ReactElement {
    return (
        <SafeAreaProvider>
            <ThemeProvider>
                <ThemedStatusBar />
                <ConvexProvider>
                    <AuthProvider>
                        <AgentchatSocketProvider>
                            <AgentProvider>
                                <ModelProvider>
                                    <WorkspaceProvider>
                                        <AppProvider>
                                            <ChatProvider>
                                                <ShareIntentBridge />
                                                <OnboardingWrapper>
                                                    <Stack
                                                        screenOptions={{
                                                            headerShown: false,
                                                        }}
                                                    />
                                                </OnboardingWrapper>
                                            </ChatProvider>
                                        </AppProvider>
                                    </WorkspaceProvider>
                                </ModelProvider>
                            </AgentProvider>
                        </AgentchatSocketProvider>
                    </AuthProvider>
                </ConvexProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
