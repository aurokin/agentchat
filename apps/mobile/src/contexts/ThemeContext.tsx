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
import { getTheme, setTheme, type UserTheme } from "@/lib/storage";

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
    background: "#FDF8F3",
    surface: "#FFFFFF",
    surfaceMuted: "#FEF3EB",
    surfaceSubtle: "#FEF5EE",
    border: "#F5E6DA",
    borderMuted: "#FEF3EB",
    text: "#2A2523",
    textMuted: "#7A706A",
    textSubtle: "#9A8D85",
    textFaint: "rgba(42, 37, 35, 0.35)",
    textOnAccent: "#FFFFFF",
    accent: "#F97316",
    accentSoft: "rgba(249, 115, 22, 0.12)",
    accentBorder: "rgba(249, 115, 22, 0.3)",
    warning: "#F59E0B",
    warningSoft: "rgba(245, 158, 11, 0.12)",
    warningBorder: "rgba(245, 158, 11, 0.4)",
    danger: "#EF4444",
    dangerSoft: "rgba(239, 68, 68, 0.12)",
    success: "#22C55E",
    successSoft: "rgba(34, 197, 94, 0.12)",
    inputBackground: "#FFFFFF",
    inputBorder: "#F5E6DA",
    link: "#F97316",
    linkOnAccent: "#FFFFFF",
    codeBackground: "rgba(42, 37, 35, 0.08)",
    codeBackgroundOnAccent: "rgba(255, 255, 255, 0.2)",
    overlay: "rgba(42, 37, 35, 0.45)",
};

const darkColors: ThemeColors = {
    background: "#0B0D12",
    surface: "#13161D",
    surfaceMuted: "#1A1D26",
    surfaceSubtle: "#161A22",
    border: "#252A36",
    borderMuted: "#1F232E",
    text: "#EAECF0",
    textMuted: "#8B919E",
    textSubtle: "#6B7280",
    textFaint: "rgba(234, 236, 240, 0.45)",
    textOnAccent: "#0B0D12",
    accent: "#A5B4FC",
    accentSoft: "rgba(165, 180, 252, 0.15)",
    accentBorder: "rgba(165, 180, 252, 0.25)",
    warning: "#FBBF24",
    warningSoft: "rgba(251, 191, 36, 0.2)",
    warningBorder: "rgba(251, 191, 36, 0.5)",
    danger: "#F87171",
    dangerSoft: "rgba(248, 113, 113, 0.2)",
    success: "#34D399",
    successSoft: "rgba(52, 211, 153, 0.2)",
    inputBackground: "#1A1D26",
    inputBorder: "#252A36",
    link: "#A5B4FC",
    linkOnAccent: "#0B0D12",
    codeBackground: "rgba(234, 236, 240, 0.08)",
    codeBackgroundOnAccent: "rgba(11, 13, 18, 0.2)",
    overlay: "rgba(11, 13, 18, 0.6)",
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
