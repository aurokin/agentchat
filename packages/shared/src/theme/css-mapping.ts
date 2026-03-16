import type { ThemeColors } from "./types";

/**
 * Maps each ThemeColors key to its corresponding CSS custom property name.
 */
export const themeColorToCssVar: Record<keyof ThemeColors, string> = {
    background: "--background",
    surface: "--background-elevated",
    surfaceMuted: "--muted",
    surfaceSubtle: "--surface-subtle",
    border: "--border",
    borderMuted: "--border-muted",
    text: "--foreground",
    textMuted: "--foreground-muted",
    textSubtle: "--muted-foreground",
    textFaint: "--text-faint",
    textOnAccent: "--primary-foreground",
    accent: "--primary",
    accentSoft: "--primary-glow",
    accentBorder: "--border-accent",
    warning: "--warning",
    warningSoft: "--warning-soft",
    warningBorder: "--warning-border",
    danger: "--error",
    dangerSoft: "--error-soft",
    success: "--success",
    successSoft: "--success-soft",
    inputBackground: "--input",
    inputBorder: "--input-border",
    link: "--link",
    linkOnAccent: "--link-on-accent",
    codeBackground: "--code-background",
    codeBackgroundOnAccent: "--code-bg-on-accent",
    overlay: "--overlay",
};

/** Returns a record of CSS variable name -> color value. */
export function themeToCssVariables(
    colors: ThemeColors,
): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const [key, cssVar] of Object.entries(themeColorToCssVar)) {
        vars[cssVar] = colors[key as keyof ThemeColors];
    }
    return vars;
}

/** Returns a CSS text block of custom property declarations (no selector). */
export function themeToCssText(colors: ThemeColors): string {
    return Object.entries(themeToCssVariables(colors))
        .map(([varName, value]) => `${varName}: ${value};`)
        .join("\n    ");
}
