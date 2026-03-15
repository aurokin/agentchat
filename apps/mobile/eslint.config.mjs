import { createTypeCheckedConfig } from "../../eslint.shared.mjs";

export default createTypeCheckedConfig({
    tsconfigRootDir: import.meta.dirname,
    react: true,
    ignores: [".expo/**", "android/**", "build/**", "ios/**", "node_modules/**"],
});
