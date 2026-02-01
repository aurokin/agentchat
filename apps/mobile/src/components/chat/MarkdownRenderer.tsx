import React, { useMemo } from "react";
import { Linking, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";
import SyntaxHighlighter from "react-native-syntax-highlighter";
import {
    atomOneDark,
    atomOneLight,
} from "react-syntax-highlighter/dist/esm/styles/hljs";
import { useTheme, type ThemeColors } from "@/contexts/ThemeContext";

interface MarkdownRendererProps {
    content: string;
    isUser?: boolean;
}

type MarkdownRules = NonNullable<
    React.ComponentProps<typeof Markdown>["rules"]
>;

const getLanguageFromInfo = (info: unknown): string | undefined => {
    if (typeof info !== "string") return undefined;
    const trimmed = info.trim();
    if (!trimmed) return undefined;
    return trimmed.split(/\s+/)[0];
};

const getLanguageFromNode = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const typedNode = node as {
        info?: string;
        attributes?: { className?: string };
    };
    const infoLanguage = getLanguageFromInfo(typedNode.info);
    if (infoLanguage) return infoLanguage;
    const className = typedNode.attributes?.className;
    if (typeof className === "string" && className.startsWith("language-")) {
        return className.replace("language-", "");
    }
    return undefined;
};

const normalizeCodeContent = (content: unknown): string => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content.join("");
    }
    return "";
};

const getNodeKey = (node: unknown): string | undefined => {
    if (!node || typeof node !== "object") return undefined;
    const key = (node as { key?: string }).key;
    return typeof key === "string" ? key : undefined;
};

const getNodeContent = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    return normalizeCodeContent(
        (node as { content?: unknown }).content,
    ).trimEnd();
};

export function MarkdownRenderer({
    content,
    isUser = false,
}: MarkdownRendererProps): React.ReactElement {
    const { colors, scheme } = useTheme();
    const markdownStyles = useMemo(
        () => createMarkdownStyles(colors, isUser),
        [colors, isUser],
    );
    const syntaxTheme = scheme === "dark" ? atomOneDark : atomOneLight;
    const codeBackground = isUser
        ? colors.codeBackgroundOnAccent
        : colors.codeBackground;

    const markdownRules = useMemo<MarkdownRules>(
        () => ({
            fence: (node) => (
                <SyntaxHighlighter
                    key={getNodeKey(node)}
                    language={getLanguageFromNode(node)}
                    style={syntaxTheme}
                    PreTag={View}
                    CodeTag={Text}
                    customStyle={{
                        backgroundColor: codeBackground,
                        padding: 12,
                        borderRadius: 8,
                        marginVertical: 6,
                    }}
                    codeTagProps={{
                        style: { fontFamily: "monospace", fontSize: 13 },
                    }}
                    wrapLongLines
                >
                    {getNodeContent(node)}
                </SyntaxHighlighter>
            ),
            code_block: (node) => (
                <SyntaxHighlighter
                    key={getNodeKey(node)}
                    language={getLanguageFromNode(node)}
                    style={syntaxTheme}
                    PreTag={View}
                    CodeTag={Text}
                    customStyle={{
                        backgroundColor: codeBackground,
                        padding: 12,
                        borderRadius: 8,
                        marginVertical: 6,
                    }}
                    codeTagProps={{
                        style: { fontFamily: "monospace", fontSize: 13 },
                    }}
                    wrapLongLines
                >
                    {getNodeContent(node)}
                </SyntaxHighlighter>
            ),
        }),
        [codeBackground, syntaxTheme],
    );

    return (
        <Markdown
            style={markdownStyles}
            rules={markdownRules}
            onLinkPress={(url) => {
                void Linking.openURL(url);
                return false;
            }}
        >
            {content}
        </Markdown>
    );
}

function createMarkdownStyles(
    colors: ThemeColors,
    isUser: boolean,
): Record<string, object> {
    const codeBackground = isUser
        ? colors.codeBackgroundOnAccent
        : colors.codeBackground;
    const codeColor = colors.text;
    const linkColor = colors.link;

    return {
        body: {
            fontSize: 16,
            lineHeight: 22,
            color: colors.text,
        },
        paragraph: {
            marginTop: 0,
            marginBottom: 8,
        },
        strong: {
            fontWeight: "700",
        },
        em: {
            fontStyle: "italic",
        },
        code: {
            backgroundColor: codeBackground,
            color: codeColor,
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderRadius: 4,
            fontFamily: "monospace",
        },
        code_inline: {
            backgroundColor: codeBackground,
            color: codeColor,
            paddingHorizontal: 4,
            paddingVertical: 2,
            borderRadius: 4,
            fontFamily: "monospace",
        },
        codeblock: {
            backgroundColor: codeBackground,
            color: codeColor,
            padding: 12,
            borderRadius: 8,
            fontFamily: "monospace",
        },
        code_block: {
            backgroundColor: codeBackground,
            color: codeColor,
            padding: 12,
            borderRadius: 8,
            fontFamily: "monospace",
        },
        fence: {
            backgroundColor: codeBackground,
            color: codeColor,
            padding: 12,
            borderRadius: 8,
        },
        link: {
            color: linkColor,
            textDecorationLine: "underline",
        },
        blockquote: {
            borderLeftWidth: 3,
            borderLeftColor: colors.border,
            paddingLeft: 12,
            color: colors.textMuted,
        },
        bullet_list: {
            marginBottom: 8,
        },
        ordered_list: {
            marginBottom: 8,
        },
        list_item: {
            marginBottom: 6,
        },
        heading1: {
            fontSize: 22,
            fontWeight: "700",
            marginBottom: 10,
        },
        heading2: {
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 8,
        },
        heading3: {
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 6,
        },
        table: {
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 6,
            overflow: "hidden",
        },
        thead: {
            backgroundColor: colors.surfaceMuted,
        },
        th: {
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRightWidth: 1,
            borderRightColor: colors.border,
        },
        tr: {
            borderBottomWidth: 1,
            borderBottomColor: colors.borderMuted,
        },
        td: {
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRightWidth: 1,
            borderRightColor: colors.borderMuted,
        },
    };
}
