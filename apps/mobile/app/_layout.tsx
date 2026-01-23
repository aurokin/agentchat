import React, { type ReactElement } from "react";
import { Stack } from "expo-router";
import { AppProvider } from "../src/contexts/AppContext";
import { ChatProvider } from "../src/contexts/ChatContext";

export default function Layout(): ReactElement {
    return (
        <AppProvider>
            <ChatProvider>
                <Stack
                    screenOptions={{
                        headerShown: false,
                    }}
                />
            </ChatProvider>
        </AppProvider>
    );
}
