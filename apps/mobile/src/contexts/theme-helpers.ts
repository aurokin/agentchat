import type { ColorSchemeName } from "react-native";
import type { UserTheme } from "@/lib/storage";

export type ThemeScheme = "light" | "dark";

export function coalesceSystemScheme(params: {
    nextSystemScheme: ColorSchemeName | null;
    previousSystemScheme: ColorSchemeName | null;
}): ColorSchemeName | null {
    const { nextSystemScheme, previousSystemScheme } = params;
    return nextSystemScheme ?? previousSystemScheme;
}

export function resolveThemeScheme(params: {
    userTheme: UserTheme;
    systemScheme: ColorSchemeName | null;
}): ThemeScheme {
    const { userTheme, systemScheme } = params;

    if (userTheme === "light" || userTheme === "dark") {
        return userTheme;
    }

    return systemScheme === "dark" ? "dark" : "light";
}
