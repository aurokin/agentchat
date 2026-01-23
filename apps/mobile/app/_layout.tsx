import React, { type ReactElement, useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { AppProvider, useAppContext } from "../src/contexts/AppContext";
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

export default function Layout(): ReactElement {
    return (
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
    );
}
