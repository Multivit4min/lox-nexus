import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketIds } from "./PacketIds.ts"

test("suggestions share the 8 characters between the words of the name", () => {
  const ids = new PacketIds([])
  assert.equal(ids.suggest("Temperature"), "temperat")
  assert.equal(ids.suggest("Living Room Temperature"), "lirotemp")
  assert.equal(ids.suggest("PV power"), "pvpower")
  assert.equal(ids.suggest("Wärme Küche"), "waerkuec")
  assert.equal(ids.suggest("!!!"), "signal")
})

test("taken ids, also earlier suggestions, get a number", () => {
  const ids = new PacketIds(["kitctemp"])
  assert.equal(ids.suggest("Kitchen Temperature"), "kitctem2")
  assert.equal(ids.suggest("Kitchen Temperature"), "kitctem3")
  for (let n = 4; n < 10; n++) ids.suggest("Kitchen Temperature")
  assert.equal(ids.suggest("Kitchen Temperature"), "kitcte10")
  assert.equal(ids.suggest("ab"), "ab")
  assert.equal(ids.suggest("ab"), "ab2")
})
