import React, { type ReactElement, useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "react-native";
import { AppProvider, useAppContext } from "../src/contexts/AppContext";
import { ThemeProvider, useTheme } from "../src/contexts/ThemeContext";
import { ChatProvider } from "../src/contexts/ChatContext";
import { AuthProvider } from "../src/lib/convex/AuthContext";
import { ModelProvider } from "../src/contexts/ModelContext";
import { SkillsProvider } from "../src/contexts/SkillsContext";
import OnboardingScreen from "./onboarding";

function OnboardingWrapper({
    children,
}: {
    children: React.ReactNode;
}): React.ReactElement {
    const router = useRouter();
    const { isInitialized, hasCompletedOnboarding, completeOnboarding } =
        useAppContext();
    const [showOnboarding, setShowOnboarding] = useState(false);

    useEffect(() => {
        if (isInitialized && !hasCompletedOnboarding) {
            setShowOnboarding(true);
        }
    }, [isInitialized, hasCompletedOnboarding]);

    const handleOnboardingComplete = async () => {
        await completeOnboarding();
        setShowOnboarding(false);
    };

    if (showOnboarding) {
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
        <ThemeProvider>
            <ThemedStatusBar />
            <AuthProvider>
                <ModelProvider>
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
                </ModelProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
