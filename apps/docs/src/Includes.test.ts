import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { Includes } from "./Includes.ts"

/** a repository with a page and the files it may show, in a temp dir removed after the test */
const repository = (t: { after: (fn: () => void) => void }, files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-includes-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  return { includes: new Includes(root), page: path.join(root, "content", "page.md") }
}

const source = [
  "import { x } from \"y\"",
  "",
  "export class Plug {",
  "  // #region poll",
  "  poll() {",
  "    // #region inner",
  "    return 1",
  "    // #endregion",
  "  }",
  "  // #endregion",
  "}",
  ""
].join("\n")

test("@code shows a whole source file as a code block, without its region markers", t => {
  const { includes, page } = repository(t, { "src/Plug.ts": source })
  const shown = includes.expand("Before\n\n<!--@code: ../src/Plug.ts-->\n\nAfter", page)
  assert.equal(shown, "Before\n\n```ts\nimport { x } from \"y\"\n\nexport class Plug {\n  poll() {\n    return 1\n  }\n}\n```\n\nAfter")
})

test("@code with #name shows one region, unindented, nested regions included", t => {
  const { includes, page } = repository(t, { "src/Plug.ts": source })
  assert.equal(includes.expand("<!--@code: ../src/Plug.ts#poll-->", page), "```ts\npoll() {\n  return 1\n}\n```")
  assert.equal(includes.expand("<!--@code: ../src/Plug.ts#inner-->", page), "```ts\nreturn 1\n```")
  assert.throws(() => includes.expand("<!--@code: ../src/Plug.ts#nope-->", page), /has no "\/\/ #region nope"/)
})

test("@code takes source and JSON files only, from inside the repository, and outlasts backticks in the code", t => {
  const { includes, page } = repository(t, { ".env": "SECRET=1", "package.json": "{}", "src/doc.ts": "const md = \"```ts\"" })
  assert.throws(() => includes.expand("<!--@code: ../.env-->", page), /can be shown as code, not \.\.\/\.env/)
  assert.throws(() => includes.expand("<!--@code: ../../outside.ts-->", page), /doesn't exist|outside the repository/)
  assert.equal(includes.expand("<!--@code: ../package.json-->", page), "```json\n{}\n```")
  assert.equal(includes.expand("<!--@code: ../src/doc.ts-->", page), "````ts\nconst md = \"```ts\"\n````")
  assert.equal(includes.expand("```md\n<!--@code: ../.env-->\n```", page), "```md\n<!--@code: ../.env-->\n```", "left alone inside a code block")
})

test("a link is judged by the file it leads to, so a source-named link to .env publishes nothing", t => {
  const { includes, page } = repository(t, { ".env": "SECRET=1", "src/Plug.ts": source })
  const root = path.dirname(path.dirname(page))
  fs.symlinkSync(path.join(root, ".env"), path.join(root, "src", "env.ts"))
  fs.symlinkSync(path.join(root, ".env"), path.join(root, "notes.md"))
  assert.throws(() => includes.expand("<!--@code: ../src/env.ts-->", page), /leads to \.env, which can't be shown as ts/)
  assert.throws(() => includes.expand("<!--@include: ../notes.md-->", page), /leads to \.env, which isn't markdown/)
})

test("a region without its end, or with a name of several words, is handled", t => {
  const { includes, page } = repository(t, { "src/a.ts": "// #region open\nx\n", "src/b.ts": "// #region two words\ny\n// #endregion\n" })
  assert.throws(() => includes.expand("<!--@code: ../src/a.ts#open-->", page), /"\/\/ #region open" has no "\/\/ #endregion"/)
  assert.equal(includes.expand("<!--@code: ../src/b.ts#two words-->", page), "```ts\ny\n```")
})
