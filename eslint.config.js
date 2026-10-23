import js from "@eslint/js"
import tseslint from "typescript-eslint"
import stylistic from "@stylistic/eslint-plugin"

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
  { ignores: ["old/", "**/dist/", "**/node_modules/", "coverage/", "data/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
    "Libraries must not depend on apps.")
)
