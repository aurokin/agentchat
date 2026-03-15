import { createTypeCheckedConfig } from "../../eslint.shared.mjs";

export default createTypeCheckedConfig({
    tsconfigRootDir: import.meta.dirname,
    ignores: ["node_modules/**"],
});
