import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { Navigation } from "./Navigation.ts"

/** a content directory with a generated reference below ref/, in a temp dir removed after the test */
const content = (t: { after: (fn: () => void) => void }, section: object) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-nav-"))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  for (const file of ["index.md", "ref/index.md", "ref/sdk/index.md", "ref/sdk/classes/Clock.md", "ref/sdk/classes/Plugin.md", "ref/testing/index.md"]) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), "# Page")
  }
  fs.writeFileSync(path.join(dir, "nav.json"), JSON.stringify({ title: "Docs", sections: [{ title: "Home", pages: ["index.md"] }, { title: "Reference", dir: "ref", ...section }] }))
  return dir
}

test("a directory lists its index pages first, then the rest by name", t => {
  assert.deepEqual(Navigation.load(content(t, {})).sections[1]?.pages, [
    "ref/index.md", "ref/sdk/index.md", "ref/testing/index.md", "ref/sdk/classes/Clock.md", "ref/sdk/classes/Plugin.md"
  ])
})

test("`first` puts pages ahead in its order, and refuses a page the directory doesn't have", t => {
  const nav = Navigation.load(content(t, { first: ["index.md", "sdk/index.md", "sdk/classes/Plugin.md"] }))
  assert.deepEqual(nav.sections[1]?.pages, [
    "ref/index.md", "ref/sdk/index.md", "ref/sdk/classes/Plugin.md", "ref/testing/index.md", "ref/sdk/classes/Clock.md"
  ])
  assert.throws(() => Navigation.load(content(t, { first: ["sdk/classes/Gone.md"] })), /puts sdk\/classes\/Gone\.md first in ref, which doesn't exist there/)
})
