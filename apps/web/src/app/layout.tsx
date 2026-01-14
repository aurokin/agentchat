import type { Metadata } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "highlight.js/styles/github-dark.css";
import { SafeConvexProvider } from "@/contexts/ConvexProvider";
import { SyncProvider } from "@/contexts/SyncContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-display",
    weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
    weight: ["400", "500", "600"],
});

const isDevelopment = process.env.NODE_ENV === "development";

export const metadata: Metadata = {
    title: isDevelopment ? "RouterChat - DEV" : "RouterChat",
    description: "Chat with AI models through OpenRouter",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`antialiased ${outfit.variable} ${ibmPlexMono.variable}`}
            >
                <SafeConvexProvider>
                    <SyncProvider>
                        <SettingsProvider>
                            <ChatProvider>{children}</ChatProvider>
                        </SettingsProvider>
                    </SyncProvider>
                </SafeConvexProvider>
                <Analytics />
            </body>
        </html>
    );
}
