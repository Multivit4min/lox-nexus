import assert from "node:assert/strict"
import { test } from "node:test"
import { SignalSelection } from "./SignalSelection.ts"

const loxone = (id: string, ms = "haus") => ({ id, owner: { kind: "miniserver" as const, id: ms } })
const plugin = (id: string, instance = "ha") => ({ id, owner: { kind: "plugin" as const, id: instance } })

test("the mode decides when no rule names the signal or its owner", () => {
  assert.equal(new SignalSelection("all").includes(loxone("a")), true)
  assert.equal(new SignalSelection("selected").includes(loxone("a")), false)
  assert.equal(SignalSelection.NONE.includes({ id: "ownerless" }), false)
})

test("a rule on the signal beats one on its owner, which beats the mode", () => {
  const selection = new SignalSelection("all", [
    { target: { miniserverId: "garage" }, include: false },
    { target: { signalId: "door" }, include: true },
    { target: { instanceId: "ha" }, include: false },
    { target: { signalId: "lamp" }, include: true }
  ])
  assert.equal(selection.includes(loxone("temp", "garage")), false, "the Miniserver is excluded")
  assert.equal(selection.includes(loxone("door", "garage")), true, "but this signal of it is in")
  assert.equal(selection.includes(loxone("temp")), true, "other Miniservers follow the mode")
  assert.equal(selection.includes(plugin("sensor")), false)
  assert.equal(selection.includes(plugin("lamp")), true)
  // an instance and a Miniserver may share an id; owners are told apart by kind
  assert.equal(selection.includes(loxone("x", "ha")), true)
})

test("selected mode takes what rules include, also whole owners", () => {
  const selection = new SignalSelection("selected", [{ target: { instanceId: "ha" }, include: true }, { target: { signalId: "noisy" }, include: false }])
  assert.equal(selection.includes(plugin("a")), true)
  assert.equal(selection.includes(plugin("noisy")), false)
  assert.equal(selection.includes(loxone("a")), false)
})
