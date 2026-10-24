import assert from "node:assert/strict"
import { test } from "node:test"
import { Slug } from "./Slug.ts"

test("slugs are lowercase topic segments without accents", () => {
  assert.equal(Slug.from("Fronius Keller"), "fronius-keller")
  assert.equal(Slug.from("  Wärme / Pumpe  "), "warme-pumpe")
  assert.equal(Slug.from("_x.y_"), "x.y_")
  assert.equal(Slug.from("!!!"), "")
})
