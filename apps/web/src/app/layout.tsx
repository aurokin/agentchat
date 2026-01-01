import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./clerk-override.css";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";

const spaceGrotesk = Space_Grotesk({
    subsets: ["latin"],
    variable: "--font-display",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "OpenChat",
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
                    colorPrimary: "#C1E628",
                    colorText: "#F0F0F0",
                    colorBackground: "#0D1117",
                    colorInputBackground: "#1C2128",
                    colorInputText: "#F0F0F0",
                    colorNeutral: "#30363D",
                    colorSuccess: "#3FB950",
                    colorWarning: "#D29922",
                    colorDanger: "#F85149",
                    fontFamily: "'Space Grotesk', sans-serif",
                    borderRadius: "0px",
                },
                elements: {
                    formButtonPrimary: "btn-brutal btn-brutal-primary",
                    card: "clerk-card",
                    headerTitle: "clerk-header-title",
                    headerSubtitle: "clerk-header-subtitle",
                    socialButtonsBlockButton: "clerk-social-btn",
                    formFieldLabel: "clerk-label",
                    formFieldInput: "input-brutal",
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
                <body className={`antialiased ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}>
                    <SettingsProvider>
                        <ChatProvider>{children}</ChatProvider>
                    </SettingsProvider>
                </body>
            </html>
        </ClerkProvider>
    );
}
