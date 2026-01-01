import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ChatProvider } from "@/contexts/ChatContext";

export const metadata: Metadata = {
  title: "OpenRouter Chat",
  description: "Chat with AI models through OpenRouter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="antialiased">
          <SettingsProvider>
            <ChatProvider>{children}</ChatProvider>
          </SettingsProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
