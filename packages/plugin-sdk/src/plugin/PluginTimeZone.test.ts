import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import { Plugin } from "./Plugin.ts"

class Plain extends Plugin {}

const zoneOf = async (timeZone?: string) => {
  const host = await PluginTestHost.start(Plain, timeZone === undefined ? {} : { timeZone })
  try {
    return host.plugin.timeZone
  } finally {
    await host.stop()
  }
}

test("timeZone is the host's, else the server's; an unknown one from the host falls back too", async () => {
  const server = Intl.DateTimeFormat().resolvedOptions().timeZone
  assert.equal(await zoneOf("Europe/Vienna"), "Europe/Vienna")
  assert.equal(await zoneOf(), server)
  assert.equal(await zoneOf("Mars/Olympus_Mons"), server)
})
