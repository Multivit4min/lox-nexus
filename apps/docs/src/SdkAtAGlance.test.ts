import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const sdk = path.join(repository, "packages", "plugin-sdk", "src")

/** the names an entry file exports, read from its `export { … }` and `export type { … }` lists */
const exportsOf = (file: string) => {
  const source = fs.readFileSync(path.join(sdk, file), "utf8")
  return [...source.matchAll(/^export (?:type )?\{([^}]+)\}/gm)].flatMap(([, list]) => list!.split(","))
    .map(item => item.trim().replace(/^type /, "").split(/\s+as\s+/).at(-1)!)
    .filter(Boolean)
}

// The page is written by hand so it stays compact; this keeps it complete. Signatures are checked
// by the generated reference, which wins when they disagree.
test("SDK at a glance lists every export plugin authors use", () => {
  const page = fs.readFileSync(path.join(repository, "apps", "docs", "content", "plugins", "sdk-at-a-glance.md"), "utf8")
  const names = [...exportsOf("index.ts"), ...exportsOf("values/index.ts"), ...exportsOf("testing/index.ts")]
  assert.ok(names.length > 30, `parsed only ${names.length} exports; did the export style change?`)
  const missing = names.filter(name => !new RegExp(`\\b${name}\\b`).test(page))
  assert.deepEqual(missing, [], "add these exports to apps/docs/content/plugins/sdk-at-a-glance.md")
})

// the generated reference shows the message unions only as z.infer<…>, so the page lists them
test("SDK at a glance has a row for every host and worker message", () => {
  const page = fs.readFileSync(path.join(repository, "apps", "docs", "content", "plugins", "sdk-at-a-glance.md"), "utf8")
  const types = ["HostMessages.ts", "WorkerMessages.ts"].flatMap(file =>
    [...fs.readFileSync(path.join(sdk, "wire", file), "utf8").matchAll(/type: z\.literal\("([^"]+)"\)/g)].map(([, type]) => type!))
  assert.ok(types.length > 20, `parsed only ${types.length} message types; did the schema style change?`)
  const missing = types.filter(type => !page.includes(`| \`${type}\` |`))
  assert.deepEqual(missing, [], "add these messages to the tables in apps/docs/content/plugins/sdk-at-a-glance.md")
})
