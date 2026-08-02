import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const languageOptions = {
  globals: {
    ...globals.browser,
    ...globals.node,
  },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-showcase/**",
      "**/.next/**",
      "**/.vinext/**",
      "**/.wrangler/**",
      "**/node_modules/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions,
  },
  ...tseslint.configs.recommended.map((configuration) => ({
    ...configuration,
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ...configuration.languageOptions,
      ...languageOptions,
    },
  })),
  {
    ...reactHooks.configs.flat.recommended,
    files: ["apps/demo/**/*.{ts,tsx}"],
    languageOptions,
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
