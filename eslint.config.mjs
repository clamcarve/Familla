import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import autoEslint from "./auto-eslint.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/out",
      "**/.gitignore",
      "**/docs",
      "**/flutter_music/**",
      "**/fastApi/**",
      "**/web/**",
      "**/auto-imports.d.ts",
      "**/components.d.ts",
      "native/**/index.d.ts",
    ],
  },
  ...compat.extends("eslint:recommended", "plugin:@typescript-eslint/recommended"),
  {
    plugins: {
      "@typescript-eslint": typescriptEslint,
      vue,
    },

    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoEslint.globals,
      },

      ecmaVersion: "latest",
      sourceType: "module",

      parserOptions: {
        parser: typescriptParser,
      },
    },

    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "vue/multi-word-component-names": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: typescriptParser,
        ecmaVersion: "latest",
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...autoEslint.globals,
      },
    },
    processor: vue.processors[".vue"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
      "vue/multi-word-component-names": "off",
    },
  },
  {
    files: ["**/.eslintrc.{js,cjs}"],

    languageOptions: {
      globals: { ...globals.node },
      ecmaVersion: 5,
      sourceType: "commonjs",
    },
  },
];
