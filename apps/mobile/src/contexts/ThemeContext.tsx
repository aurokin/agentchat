import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    useCallback,
    type ReactNode,
    type ReactElement,
} from "react";
import { useColorScheme } from "react-native";
import { getTheme, setTheme, type UserTheme } from "../lib/storage";

export type ThemeScheme = "light" | "dark";

export type ThemeColors = {
    background: string;
    surface: string;
    surfaceMuted: string;
    surfaceSubtle: string;
    border: string;
    borderMuted: string;
    text: string;
    textMuted: string;
    textSubtle: string;
    textFaint: string;
    textOnAccent: string;
    accent: string;
    accentSoft: string;
    accentBorder: string;
    warning: string;
    warningSoft: string;
    warningBorder: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    inputBackground: string;
    inputBorder: string;
    link: string;
    linkOnAccent: string;
    codeBackground: string;
    codeBackgroundOnAccent: string;
    overlay: string;
};

const lightColors: ThemeColors = {
    background: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceMuted: "#F5F5F5",
    surfaceSubtle: "#F0F0F0",
    border: "#E5E5E8",
    borderMuted: "#F0F0F0",
    text: "#0B0B0D",
    textMuted: "#666666",
    textSubtle: "#888888",
    textFaint: "#999999",
    textOnAccent: "#FFFFFF",
    accent: "#007AFF",
    accentSoft: "#E6F0FF",
    accentBorder: "rgba(0, 122, 255, 0.4)",
    warning: "#FF9500",
    warningSoft: "rgba(255, 149, 0, 0.12)",
    warningBorder: "rgba(255, 149, 0, 0.4)",
    danger: "#FF3B30",
    dangerSoft: "rgba(255, 59, 48, 0.12)",
    success: "#34C759",
    successSoft: "rgba(52, 199, 89, 0.12)",
    inputBackground: "#F9F9F9",
    inputBorder: "#DDDDDD",
    link: "#007AFF",
    linkOnAccent: "#D6ECFF",
    codeBackground: "rgba(0, 0, 0, 0.08)",
    codeBackgroundOnAccent: "rgba(255, 255, 255, 0.2)",
    overlay: "rgba(0, 0, 0, 0.5)",
};

const darkColors: ThemeColors = {
    background: "#0B0B0D",
    surface: "#151517",
    surfaceMuted: "#1E1E22",
    surfaceSubtle: "#232328",
    border: "#2A2A30",
    borderMuted: "#24242A",
    text: "#F5F5F7",
    textMuted: "#B3B3B8",
    textSubtle: "#8E8E93",
    textFaint: "#7A7A80",
    textOnAccent: "#FFFFFF",
    accent: "#0A84FF",
    accentSoft: "rgba(10, 132, 255, 0.2)",
    accentBorder: "rgba(10, 132, 255, 0.5)",
    warning: "#FF9F0A",
    warningSoft: "rgba(255, 159, 10, 0.2)",
    warningBorder: "rgba(255, 159, 10, 0.5)",
    danger: "#FF453A",
    dangerSoft: "rgba(255, 69, 58, 0.2)",
    success: "#30D158",
    successSoft: "rgba(48, 209, 88, 0.2)",
    inputBackground: "#1C1C22",
    inputBorder: "#2A2A30",
    link: "#4FA3FF",
    linkOnAccent: "#D6E9FF",
    codeBackground: "rgba(255, 255, 255, 0.08)",
    codeBackgroundOnAccent: "rgba(255, 255, 255, 0.18)",
    overlay: "rgba(0, 0, 0, 0.6)",
};

type ThemeContextValue = {
    userTheme: UserTheme;
    scheme: ThemeScheme;
    colors: ThemeColors;
    setUserTheme: (theme: UserTheme) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return context;
}

export function ThemeProvider({
    children,
}: {
    children: ReactNode;
}): ReactElement {
    const systemScheme = useColorScheme();
    const [userTheme, setUserThemeState] = useState<UserTheme>("system");

    useEffect(() => {
        let isMounted = true;
        const loadTheme = async () => {
            const storedTheme = await getTheme();
            if (isMounted) {
                setUserThemeState(storedTheme);
            }
        };
        loadTheme();
        return () => {
            isMounted = false;
        };
    }, []);

    const scheme: ThemeScheme =
        userTheme === "system"
            ? systemScheme === "dark"
                ? "dark"
                : "light"
            : userTheme;

    const colors = scheme === "dark" ? darkColors : lightColors;

    const setUserTheme = useCallback(async (theme: UserTheme) => {
        setUserThemeState(theme);
        await setTheme(theme);
    }, []);

    const value = useMemo(
        () => ({
            userTheme,
            scheme,
            colors,
            setUserTheme,
        }),
        [userTheme, scheme, colors, setUserTheme],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
