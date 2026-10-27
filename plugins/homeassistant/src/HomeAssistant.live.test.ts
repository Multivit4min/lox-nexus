import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomeAssistantPlugin } from "./HomeAssistantPlugin.ts"

/**
 * Against a real Home Assistant (see .env); skipped unless HA_TEST_URL and HA_TEST_TOKEN are set.
 * Read-only: it logs in, reads states and the registries, and calls no service. No wrong-token
 * test: Home Assistant can ban an address after failed logins.
 */
describe("HomeAssistantPlugin against a real Home Assistant", () => {
  const { HA_TEST_URL: url, HA_TEST_TOKEN: token } = process.env
  const skip = url && token ? false : "set HA_TEST_URL and HA_TEST_TOKEN"

  test("connects, follows sun.sun and builds the catalog", { skip, timeout: 30_000 }, async () => {
    const host = await PluginTestHost.start(HomeAssistantPlugin, { config: { url, token } })
    try {
      const sun = await host.addSensor("state", { entityId: "sun.sun" })
      const value = host.values(sun)[0] ?? await host.next(sun, 10_000)
      assert.equal(value.type, "string")
      const catalog = await host.catalog()
      assert.ok(catalog.length > 0)
      const panel = await host.panel()
      assert.ok(panel?.type === "keyValue" && panel.items.some(item => item.label === "Connection" && item.value.startsWith("connected")))
    } finally {
      await host.stop()
    }
  })
})
