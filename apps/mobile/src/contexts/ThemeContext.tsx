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
import { Platform, useColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import * as NavigationBar from "expo-navigation-bar";
import {
    isDynamicThemeSupported,
    useMaterial3Theme,
    type Material3Scheme,
} from "@pchmn/expo-material3-theme";
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

function parseHexColor(
    hexColor: string,
): { r: number; g: number; b: number } | null {
    const normalized = hexColor.replace("#", "");
    if (normalized.length === 3) {
        const [r, g, b] = normalized.split("");
        if (!r || !g || !b) return null;

        const parsed = {
            r: Number.parseInt(`${r}${r}`, 16),
            g: Number.parseInt(`${g}${g}`, 16),
            b: Number.parseInt(`${b}${b}`, 16),
        };

        if (
            Number.isNaN(parsed.r) ||
            Number.isNaN(parsed.g) ||
            Number.isNaN(parsed.b)
        ) {
            return null;
        }

        return parsed;
    }

    if (normalized.length === 6 || normalized.length === 8) {
        const offset = normalized.length === 8 ? 2 : 0;
        const parsed = {
            r: Number.parseInt(normalized.slice(offset, offset + 2), 16),
            g: Number.parseInt(normalized.slice(offset + 2, offset + 4), 16),
            b: Number.parseInt(normalized.slice(offset + 4, offset + 6), 16),
        };

        if (
            Number.isNaN(parsed.r) ||
            Number.isNaN(parsed.g) ||
            Number.isNaN(parsed.b)
        ) {
            return null;
        }

        return parsed;
    }

    return null;
}

function withAlpha(color: string, alpha: number, fallback: string): string {
    const rgb = parseHexColor(color);
    if (!rgb) return fallback;
    const normalizedAlpha = Math.max(0, Math.min(alpha, 1));
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
}

function mapMaterialSchemeToThemeColors(
    materialScheme: Material3Scheme,
    baseColors: ThemeColors,
    scheme: ThemeScheme,
): ThemeColors {
    return {
        background: materialScheme.background,
        surface: materialScheme.surface,
        surfaceMuted: materialScheme.surfaceContainer,
        surfaceSubtle: materialScheme.surfaceContainerLow,
        border: materialScheme.outlineVariant,
        borderMuted: withAlpha(
            materialScheme.outline,
            scheme === "dark" ? 0.35 : 0.24,
            baseColors.borderMuted,
        ),
        text: materialScheme.onSurface,
        textMuted: materialScheme.onSurfaceVariant,
        textSubtle: withAlpha(
            materialScheme.onSurfaceVariant,
            scheme === "dark" ? 0.72 : 0.64,
            baseColors.textSubtle,
        ),
        textFaint: withAlpha(
            materialScheme.onSurfaceVariant,
            scheme === "dark" ? 0.44 : 0.36,
            baseColors.textFaint,
        ),
        textOnAccent: materialScheme.onPrimary,
        accent: materialScheme.primary,
        accentSoft: withAlpha(
            materialScheme.primaryContainer,
            scheme === "dark" ? 0.35 : 0.45,
            baseColors.accentSoft,
        ),
        accentBorder: withAlpha(
            materialScheme.primary,
            scheme === "dark" ? 0.48 : 0.32,
            baseColors.accentBorder,
        ),
        warning: materialScheme.tertiary,
        warningSoft: withAlpha(
            materialScheme.tertiaryContainer,
            scheme === "dark" ? 0.38 : 0.48,
            baseColors.warningSoft,
        ),
        warningBorder: withAlpha(
            materialScheme.tertiary,
            scheme === "dark" ? 0.52 : 0.4,
            baseColors.warningBorder,
        ),
        danger: materialScheme.error,
        dangerSoft: withAlpha(
            materialScheme.errorContainer,
            scheme === "dark" ? 0.35 : 0.45,
            baseColors.dangerSoft,
        ),
        success: materialScheme.secondary,
        successSoft: withAlpha(
            materialScheme.secondaryContainer,
            scheme === "dark" ? 0.35 : 0.45,
            baseColors.successSoft,
        ),
        inputBackground: materialScheme.surfaceContainerHigh,
        inputBorder: materialScheme.outlineVariant,
        link: materialScheme.primary,
        linkOnAccent: materialScheme.onPrimary,
        codeBackground: withAlpha(
            materialScheme.onSurface,
            scheme === "dark" ? 0.16 : 0.08,
            baseColors.codeBackground,
        ),
        codeBackgroundOnAccent: withAlpha(
            materialScheme.onPrimary,
            scheme === "dark" ? 0.25 : 0.2,
            baseColors.codeBackgroundOnAccent,
        ),
        overlay: withAlpha(
            materialScheme.scrim,
            scheme === "dark" ? 0.62 : 0.46,
            baseColors.overlay,
        ),
    };
}

type ThemeContextValue = {
    userTheme: UserTheme;
    scheme: ThemeScheme;
    colors: ThemeColors;
    isMaterialYouActive: boolean;
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
    const { theme: materialTheme } = useMaterial3Theme({
        fallbackSourceColor: lightColors.accent,
    });
    const [userTheme, setUserThemeState] = useState<UserTheme>("system");

    useEffect(() => {
        let isMounted = true;
        const loadTheme = async () => {
            const storedTheme = await getTheme();
            if (isMounted) {
                setUserThemeState(storedTheme);
            }
        };
        void loadTheme();
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

    const baseColors = scheme === "dark" ? darkColors : lightColors;
    const useMaterialYouColors =
        Platform.OS === "android" &&
        userTheme === "system" &&
        isDynamicThemeSupported;
    const colors = useMaterialYouColors
        ? mapMaterialSchemeToThemeColors(
              scheme === "dark" ? materialTheme.dark : materialTheme.light,
              baseColors,
              scheme,
          )
        : baseColors;

    const setUserTheme = useCallback(async (theme: UserTheme) => {
        setUserThemeState(theme);
        await setTheme(theme);
    }, []);

    useEffect(() => {
        void SystemUI.setBackgroundColorAsync(colors.background).catch(
            () => undefined,
        );

        if (Platform.OS !== "android") {
            return;
        }

        void NavigationBar.setBackgroundColorAsync(colors.background).catch(
            () => undefined,
        );
        void NavigationBar.setBorderColorAsync("transparent").catch(
            () => undefined,
        );
        void NavigationBar.setButtonStyleAsync(
            scheme === "dark" ? "light" : "dark",
        ).catch(() => undefined);
    }, [colors.background, scheme]);

    const value = useMemo(
        () => ({
            userTheme,
            scheme,
            colors,
            isMaterialYouActive: useMaterialYouColors,
            setUserTheme,
        }),
        [userTheme, scheme, colors, useMaterialYouColors, setUserTheme],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
