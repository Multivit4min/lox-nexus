import js from "@eslint/js"
import tseslint from "typescript-eslint"
import stylistic from "@stylistic/eslint-plugin"
import pluginVue from "eslint-plugin-vue"
import globals from "globals"

const workspace = name => [`@lox-nexus/${name}`, `@lox-nexus/${name}/*`]

const restrictImports = (files, forbidden, message) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [{ group: forbidden.flatMap(workspace), message }]
    }]
  }
})

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "coverage/", "data/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
    rules: {
      // shadcn-vue components are single-word (Button, Card) by design
      "vue/multi-word-component-names": "off",
      // optional typed props (class?: string) need no runtime default
      "vue/require-default-prop": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": ["error", { html: { void: "always", normal: "never", component: "always" } }]
    }
  },
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/semi": ["error", "never"],
      "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
      "max-lines": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }]
    }
  },
  {
    files: ["apps/web/**", "apps/docs/src/assets/**"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off" }
  },
  restrictImports(["plugins/**"], ["core", "loxone", "ici", "api", "server", "web"],
    "Plugins may only depend on @lox-nexus/plugin-sdk."),
  restrictImports(["packages/plugin-sdk/**"], ["core", "loxone", "ici", "api", "server", "web"],
    "The plugin SDK is published and must stay independent of the host."),
  restrictImports(["packages/ici/**"], ["core", "loxone", "plugin-sdk", "api", "server", "web"],
    "packages/ici is a standalone protocol library without workspace dependencies."),
  restrictImports(["packages/core/**"], ["loxone", "ici", "api", "server", "web"],
    "core is IO-free; Loxone and the server plug into it, not the other way round."),
  restrictImports(["packages/loxone/**", "packages/api/**"], ["server", "web"],
    "Libraries must not depend on apps."),
  // the web bundles packages/api, so core may only lend it types; loxone and ici not even that
  {
    files: ["packages/api/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": ["error", {
        patterns: [
          { group: workspace("core"), allowTypeImports: true, message: "packages/api may import types from core only (import type), so no core code reaches the web bundle." },
          { group: [...workspace("loxone"), ...workspace("ici")], message: "packages/api must not depend on loxone or ici." }
        ]
      }]
    }
  },
  restrictImports(["apps/web/**"], ["core", "loxone", "ici", "server"],
    "The web UI talks to the server through @lox-nexus/api only (plus plugin-sdk/values)."),
  restrictImports(["apps/docs/**"], ["core", "loxone", "ici", "api", "server", "web", "plugin-sdk"],
    "The docs site reads the SDK's source through TypeDoc only, so it can be built and hosted on its own.")
)
