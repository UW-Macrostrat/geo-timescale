import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      curly: "error",
    },
  },
  {
    files: ["scripts/**"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: ["dist/"],
  },
];
