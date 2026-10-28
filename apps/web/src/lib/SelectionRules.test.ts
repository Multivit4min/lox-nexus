import assert from "node:assert/strict"
import { test } from "node:test"
import type { SelectionDto } from "@lox-nexus/api"
import { SelectionRules } from "./SelectionRules.ts"

test("the signal's rule, then its owner's, then the mode, like the server", () => {
  const selection: SelectionDto = {
    consumer: "x", mode: "all",
    rules: [{ target: { miniserverId: "garage" }, include: false }, { target: { signalId: "door" }, include: true }, { target: { instanceId: "ha" }, include: false }]
  }
  const ms = (id: string, owner: string) => ({ id, owner: { kind: "miniserver" as const, id: owner } })
  assert.deepEqual(
    [SelectionRules.includes(selection, ms("temp", "garage")), SelectionRules.includes(selection, ms("door", "garage")), SelectionRules.includes(selection, ms("x", "haus")),
      SelectionRules.includes(selection, { id: "s", owner: { kind: "plugin", id: "ha" } }), SelectionRules.includes(selection, { id: "lone" })],
    [false, true, true, false, true]
  )
})
