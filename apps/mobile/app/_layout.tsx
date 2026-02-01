import type { ReactElement, ReactNode } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppProvider, useAppContext } from "../src/contexts/AppContext";
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext";
import { ChatProvider } from "../src/contexts/ChatContext";
import { AuthProvider } from "../src/lib/convex/AuthContext";
import { ConvexProvider } from "../src/lib/convex";
import { ModelProvider } from "../src/contexts/ModelContext";
import { SkillsProvider } from "../src/contexts/SkillsContext";
import { SyncProvider } from "../src/contexts/SyncContext";
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
            backgroundColor={colors.background}
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
                        <ModelProvider>
                            <SyncProvider>
                                <SkillsProvider>
                                    <AppProvider>
                                        <ChatProvider>
                                            <OnboardingWrapper>
                                                <Stack
                                                    screenOptions={{
                                                        headerShown: false,
                                                    }}
                                                />
                                            </OnboardingWrapper>
                                        </ChatProvider>
                                    </AppProvider>
                                </SkillsProvider>
                            </SyncProvider>
                        </ModelProvider>
                    </AuthProvider>
                </ConvexProvider>
            </ThemeProvider>
        </SafeAreaProvider>
    );
}
