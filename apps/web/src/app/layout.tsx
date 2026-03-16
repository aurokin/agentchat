import type { Metadata } from "next";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "highlight.js/styles/github-dark.css";
import { SafeConvexProvider } from "@/contexts/ConvexProvider";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { getThemeCssText } from "@/lib/theme-css";

// Required for CSP nonces:
// The middleware generates a per-request CSP nonce, and Next can only attach that nonce to
// its inline scripts when rendering per-request (not from a static HTML file).
export const dynamic = "force-dynamic";

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
    title: isDevelopment ? "Agentchat - DEV" : "Agentchat",
    description: "Chat with agents hosted on your own server",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <head>
                <style
                    dangerouslySetInnerHTML={{ __html: getThemeCssText() }}
                />
            </head>
            <body
                className={`antialiased ${outfit.variable} ${ibmPlexMono.variable}`}
            >
                <SafeConvexProvider>
                    <AgentProvider>
                        <WorkspaceProvider>
                            <SettingsProvider>
                                <ChatProvider>{children}</ChatProvider>
                            </SettingsProvider>
                        </WorkspaceProvider>
                    </AgentProvider>
                </SafeConvexProvider>
            </body>
        </html>
    );
}
