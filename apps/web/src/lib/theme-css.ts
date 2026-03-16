import {
    lightColors,
    darkColors,
    themeToCssVariables,
} from "@agentchat/shared";

/** Web-only extension tokens not derived from ThemeColors. */
const darkExtensions: Record<string, string> = {
    "--secondary": "#86efac",
    "--secondary-foreground": "#0b0d12",
    "--accent": "#f9a8d4",
    "--accent-foreground": "#0b0d12",
    "--ring": "#a5b4fc",
};

const lightExtensions: Record<string, string> = {
    "--secondary": "#fdba74",
    "--secondary-foreground": "#2a2523",
    "--accent": "#ea580c",
    "--accent-foreground": "#ffffff",
    "--ring": "#f97316",
};

function varsToBlock(vars: Record<string, string>): string {
    return Object.entries(vars)
        .map(([k, v]) => `    ${k}: ${v};`)
        .join("\n");
}

export function getThemeCssText(): string {
    const darkVars = { ...themeToCssVariables(darkColors), ...darkExtensions };
    const lightVars = {
        ...themeToCssVariables(lightColors),
        ...lightExtensions,
    };

    return `:root {\n${varsToBlock(darkVars)}\n}\n\n.light {\n${varsToBlock(lightVars)}\n}`;
}
