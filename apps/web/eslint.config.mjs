import { createTypeCheckedConfig } from "../../eslint.shared.mjs";

export default createTypeCheckedConfig({
    tsconfigRootDir: import.meta.dirname,
    react: true,
    ignores: [
        ".next/**",
        "node_modules/**",
        "convex/_generated/**",
        "**/*.config.ts",
        "**/next-env.d.ts",
    ],
});
