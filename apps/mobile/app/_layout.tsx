import React, { type ReactElement } from "react";
import { Stack } from "expo-router";
import { AppProvider } from "../src/contexts/AppContext";
import { ChatProvider } from "../src/contexts/ChatContext";
import { AuthProvider } from "../src/lib/convex/AuthContext";

export default function Layout(): ReactElement {
    return (
        <AuthProvider>
            <AppProvider>
                <ChatProvider>
                    <Stack
                        screenOptions={{
                            headerShown: false,
                        }}
                    />
                </ChatProvider>
            </AppProvider>
        </AuthProvider>
    );
}
