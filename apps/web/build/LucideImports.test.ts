import assert from "node:assert/strict"
import { test } from "node:test"
import { LucideImports } from "./LucideImports.ts"

const index = [
  "export { default as X, default as XIcon, default as LucideX } from './icons/x.mjs';",
  "export { default as LockOpen, default as Unlock } from './icons/lock-open.mjs';",
  "export { default as ChevronsUpDown } from './icons/chevrons-up-down.mjs';"
].join("\n")
const lucide = new LucideImports(index)

test("each icon is imported from its own file, aliases included, on one line", () => {
  const code = "import { computed } from \"vue\"\nimport { X, Unlock as Open, ChevronsUpDown } from \"@lucide/vue\"\nconst a = 1\n"
  assert.equal(lucide.rewrite(code), "import { computed } from \"vue\"\n"
    + "import X from \"@lucide/vue/dist/esm/icons/x.mjs\"; import Open from \"@lucide/vue/dist/esm/icons/lock-open.mjs\"; "
    + "import ChevronsUpDown from \"@lucide/vue/dist/esm/icons/chevrons-up-down.mjs\";\nconst a = 1\n")
})

test("an import naming something unknown is left as it is; files without icon imports aren't touched", () => {
  const code = "import { X, createLucideIcon } from \"@lucide/vue\"\n"
  assert.equal(lucide.rewrite(code), undefined)
  assert.equal(lucide.rewrite("import { ref } from \"vue\"\n"), undefined)
})

test("the real package maps every icon the app imports", () => {
  const real = LucideImports.fromPackage()
  assert.ok(real.size > 3000, String(real.size))
  assert.match(real.rewrite("import { XIcon, House, DatabaseBackup } from \"@lucide/vue\"") ?? "", /icons\/x\.mjs.*icons\/house\.mjs.*icons\/database-backup\.mjs/)
})
