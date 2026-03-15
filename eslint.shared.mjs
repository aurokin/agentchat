import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

function typedRules() {
    return {
        "@typescript-eslint/consistent-type-imports": [
            "error",
            {
                prefer: "type-imports",
                fixStyle: "separate-type-imports",
            },
        ],
        "@typescript-eslint/no-floating-promises": [
            "error",
            {
                ignoreVoid: true,
                ignoreIIFE: true,
            },
        ],
        "@typescript-eslint/no-misused-promises": [
            "error",
            {
                checksVoidReturn: {
                    attributes: false,
                },
            },
        ],
        "@typescript-eslint/switch-exhaustiveness-check": "error",
    };
}

export function createTypeCheckedConfig({
    tsconfigRootDir,
    ignores = [],
    react = false,
}) {
    const configs = [
        {
            files: ["**/*.{ts,tsx}"],
            languageOptions: {
                parser: tseslint.parser,
                parserOptions: {
                    ecmaVersion: "latest",
                    sourceType: "module",
                    projectService: true,
                    tsconfigRootDir,
                    ...(react
                        ? {
                              ecmaFeatures: {
                                  jsx: true,
                              },
                          }
                        : {}),
                },
            },
            plugins: {
                "@typescript-eslint": tseslint.plugin,
            },
            rules: {
                ...typedRules(),
            },
        },
    ];

    if (react) {
        configs[0].plugins.react = pluginReact;
        configs[0].plugins["react-hooks"] = pluginReactHooks;
        configs[0].settings = {
            react: {
                version: "19",
            },
        };
        configs[0].rules = {
            ...configs[0].rules,
            ...pluginReact.configs.recommended.rules,
            ...pluginReact.configs["jsx-runtime"].rules,
            ...pluginReactHooks.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
        };
    }

    if (ignores.length > 0) {
        configs.push({
            ignores,
        });
    }

    return tseslint.config(...configs);
}
