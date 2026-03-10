import React, { type ReactElement, useMemo, useState } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";

interface OnboardingScreenProps {
    onComplete: () => Promise<void>;
}

export default function OnboardingScreen({
    onComplete,
}: OnboardingScreenProps): ReactElement {
    const router = useRouter();
    const [currentStep, setCurrentStep] = useState(0);
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const handleGetStarted = async () => {
        await onComplete();
        router.replace("/");
    };

    const handleNext = async () => {
        if (currentStep < 2) {
            setCurrentStep(currentStep + 1);
        } else {
            await handleGetStarted();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const steps = [
        {
            title: "Welcome to Agentchat",
            subtitle: "An offline-first chat app powered by OpenRouter",
            content: [],
        },
        {
            title: "Local-First Design",
            subtitle: "Your chats stay on your device by default",
            content: [
                "• All chats stored locally on your device",
                "• Works completely offline",
                "• Fast and private - no server required",
                "• Your API key stays on your device by default",
            ],
        },
        {
            title: "Optional Cloud Sync",
            subtitle: "Sync across devices when you're ready",
            content: [
                "• Sign in with Google to enable cloud sync",
                "• Chats sync across mobile and web",
                "• Backup your conversations safely",
                "• API keys sync in encrypted form",
                "• Turn sync on or off anytime",
            ],
        },
    ];

    const step = steps[currentStep];

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <ScrollView
                    style={styles.scrollContent}
                    contentContainerStyle={styles.content}
                >
                    <View style={styles.progressContainer}>
                        {[0, 1, 2].map((i) => (
                            <View
                                key={i}
                                style={[
                                    styles.progressDot,
                                    i === currentStep &&
                                        styles.progressDotActive,
                                ]}
                            />
                        ))}
                    </View>

                    <Text style={styles.title}>{step.title}</Text>
                    <Text style={styles.subtitle}>{step.subtitle}</Text>

                    <View style={styles.featureList}>
                        {step.content.map((item, index) => (
                            <View key={index} style={styles.featureItem}>
                                <Text style={styles.featureText}>{item}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={styles.buttonContainer}>
                        {currentStep > 0 && (
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={handleBack}
                            >
                                <Text style={styles.backButtonText}>Back</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[
                                styles.button,
                                currentStep === 0 && styles.buttonFullWidth,
                            ]}
                            onPress={handleNext}
                        >
                            <Text style={styles.buttonText}>
                                {currentStep === 2 ? "Get Started" : "Next"}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const createStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        scrollContent: {
            flex: 1,
        },
        content: {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 24,
            paddingVertical: 32,
        },
        progressContainer: {
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            marginBottom: 32,
        },
        progressDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.border,
            marginHorizontal: 4,
        },
        progressDotActive: {
            backgroundColor: colors.accent,
        },
        title: {
            fontSize: 28,
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: 12,
            color: colors.text,
        },
        subtitle: {
            fontSize: 18,
            textAlign: "center",
            color: colors.textMuted,
            marginBottom: 24,
        },
        featureList: {
            width: "100%",
            marginBottom: 32,
        },
        featureItem: {
            paddingVertical: 8,
        },
        featureText: {
            fontSize: 16,
            color: colors.text,
            lineHeight: 24,
        },
        buttonContainer: {
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            marginTop: 16,
        },
        button: {
            backgroundColor: colors.accent,
            paddingHorizontal: 32,
            paddingVertical: 14,
            borderRadius: 8,
            alignItems: "center",
            flex: 1,
        },
        buttonFullWidth: {
            flex: 1,
        },
        backButton: {
            paddingHorizontal: 24,
            paddingVertical: 14,
            alignItems: "center",
            flex: 1,
            marginRight: 12,
        },
        backButtonText: {
            color: colors.textMuted,
            fontSize: 16,
            fontWeight: "600",
        },
        buttonText: {
            color: colors.textOnAccent,
            fontSize: 18,
            fontWeight: "600",
        },
    });
