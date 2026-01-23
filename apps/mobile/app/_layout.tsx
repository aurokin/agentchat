import React, { type ReactElement } from "react";
import { Stack } from "expo-router";
import { AppProvider } from "../src/contexts/AppContext";
import { ChatProvider } from "../src/contexts/ChatContext";
import { AuthProvider } from "../src/lib/convex/AuthContext";
import { ModelProvider } from "../src/contexts/ModelContext";
import { SkillsProvider } from "../src/contexts/SkillsContext";

export default function Layout(): ReactElement {
    return (
        <AuthProvider>
            <ModelProvider>
                <SkillsProvider>
                    <AppProvider>
                        <ChatProvider>
                            <Stack
                                screenOptions={{
                                    headerShown: false,
                                }}
                            />
                        </ChatProvider>
                    </AppProvider>
                </SkillsProvider>
            </ModelProvider>
        </AuthProvider>
    );
}
