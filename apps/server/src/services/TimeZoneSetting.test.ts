import assert from "node:assert/strict"
import { test } from "node:test"
import { TimeZoneSetting } from "./TimeZoneSetting.ts"

test("keeps a zone the runtime knows; anything else is neither stored nor returned", () => {
  const stored = new Map<string, unknown>()
  const setting = new TimeZoneSetting({ get: key => stored.get(key), set: (key, value) => void stored.set(key, value) })
  assert.equal(setting.get(), undefined)
  assert.equal(setting.set("Mars/Olympus_Mons"), false)
  assert.equal(setting.set(""), false)
  assert.equal(setting.set("Europe/Vienna"), true)
  assert.equal(setting.get(), "Europe/Vienna")
  stored.set(TimeZoneSetting.KEY, "Atlantis/Capital")
  assert.equal(setting.get(), undefined, "e.g. a zone renamed by a later runtime")
})
