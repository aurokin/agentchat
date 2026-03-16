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
import { Appearance, Platform, type ColorSchemeName } from "react-native";
import * as SystemUI from "expo-system-ui";
import * as NavigationBar from "expo-navigation-bar";
import { getTheme, setTheme, type UserTheme } from "@/lib/storage";
import {
    coalesceSystemScheme,
    resolveThemeScheme,
    type ThemeScheme,
} from "@/contexts/theme-helpers";
import { lightColors, darkColors, type ThemeColors } from "@agentchat/shared";

export type { ThemeScheme } from "@/contexts/theme-helpers";
export type { ThemeColors } from "@agentchat/shared";

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
    const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null>(
        () => Appearance.getColorScheme() ?? null,
    );
    const [userTheme, setUserThemeState] = useState<UserTheme>("system");

    useEffect(() => {
        // iOS dev builds can transiently report null; preserve the last known
        // concrete scheme instead of flashing back to light.
        const applySystemScheme = (nextScheme: ColorSchemeName | null) => {
            setSystemScheme((previousScheme) =>
                coalesceSystemScheme({
                    nextSystemScheme: nextScheme,
                    previousSystemScheme: previousScheme,
                }),
            );
        };

        applySystemScheme(Appearance.getColorScheme() ?? null);

        const subscription = Appearance.addChangeListener(({ colorScheme }) => {
            applySystemScheme(colorScheme ?? null);
        });

        return () => {
            subscription.remove();
        };
    }, []);

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

    const scheme: ThemeScheme = resolveThemeScheme({ userTheme, systemScheme });
    const colors = scheme === "dark" ? darkColors : lightColors;

    const setUserTheme = useCallback(async (theme: UserTheme) => {
        setUserThemeState(theme);
        await setTheme(theme);
    }, []);

    useEffect(() => {
        if (Platform.OS === "android") {
            void SystemUI.setBackgroundColorAsync(colors.background).catch(
                () => undefined,
            );
        }

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
            setUserTheme,
        }),
        [userTheme, scheme, colors, setUserTheme],
    );

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
