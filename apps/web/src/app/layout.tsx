import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Outfit, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./clerk-override.css";
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

export const metadata: Metadata = {
    title: "RouterChat",
    description: "Chat with AI models through OpenRouter",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <ClerkProvider
            appearance={{
                variables: {
                    colorPrimary: "#d4af37",
                    colorText: "#f5f0e8",
                    colorBackground: "#0a0f14",
                    colorInputBackground: "#151c24",
                    colorInputText: "#f5f0e8",
                    colorNeutral: "#2a3441",
                    colorSuccess: "#22c55e",
                    colorWarning: "#f59e0b",
                    colorDanger: "#ef4444",
                    fontFamily: "'Outfit', sans-serif",
                    borderRadius: "2px",
                },
                elements: {
                    formButtonPrimary: "btn-deco btn-deco-primary",
                    card: "clerk-card",
                    headerTitle: "clerk-header-title",
                    headerSubtitle: "clerk-header-subtitle",
                    socialButtonsBlockButton: "clerk-social-btn",
                    formFieldLabel: "clerk-label",
                    formFieldInput: "input-deco",
                    identityPreviewText: "clerk-identity-text",
                    identityPreviewEditButton: "clerk-edit-btn",
                    dividerLine: "clerk-divider",
                    dividerText: "clerk-divider-text",
                    footerActionLink: "clerk-footer-link",
                    formResendCodeLink: "clerk-resend-link",
                    alert: "clerk-alert",
                },
            }}
        >
            <html lang="en">
                <body
                    className={`antialiased ${outfit.variable} ${ibmPlexMono.variable}`}
                >
                    <SettingsProvider>
                        <ChatProvider>{children}</ChatProvider>
                    </SettingsProvider>
                </body>
            </html>
        </ClerkProvider>
    );
}
