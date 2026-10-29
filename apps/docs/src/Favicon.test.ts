import assert from "node:assert/strict"
import fs from "node:fs"
import { test } from "node:test"

const web = new URL("../../web/public/", import.meta.url)
const docs = new URL("./assets/", import.meta.url)

test("the docs site carries the same icons as the web app", () => {
  for (const name of ["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]) {
    assert.deepEqual(fs.readFileSync(new URL(name, docs)), fs.readFileSync(new URL(name, web)), `${name} differs; copy it from apps/web/public`)
  }
})
