import React, { type ReactElement } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function OnboardingScreen(): ReactElement {
    const router = useRouter();

    const handleGetStarted = () => {
        router.replace("/");
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <View style={styles.content}>
                    <Text style={styles.title}>Welcome to RouterChat</Text>
                    <Text style={styles.subtitle}>
                        An offline-first chat app powered by OpenRouter
                    </Text>

                    <View style={styles.featureList}>
                        <View style={styles.featureItem}>
                            <Text style={styles.featureText}>
                                • Chat offline with local storage
                            </Text>
                        </View>
                        <View style={styles.featureItem}>
                            <Text style={styles.featureText}>
                                • Optional cloud sync across devices
                            </Text>
                        </View>
                        <View style={styles.featureItem}>
                            <Text style={styles.featureText}>
                                • Support for thinking models
                            </Text>
                        </View>
                        <View style={styles.featureItem}>
                            <Text style={styles.featureText}>
                                • Image attachments
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleGetStarted}
                    >
                        <Text style={styles.buttonText}>Get Started</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    content: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 16,
        color: "#000",
    },
    subtitle: {
        fontSize: 16,
        textAlign: "center",
        color: "#666",
        marginBottom: 32,
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
        color: "#333",
    },
    button: {
        backgroundColor: "#007AFF",
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 8,
        width: "100%",
        alignItems: "center",
    },
    buttonText: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "600",
    },
});
