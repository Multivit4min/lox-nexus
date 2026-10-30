import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { CalendarPlugin } from "./CalendarPlugin.ts"
import { IcsServer } from "./test-support/IcsServer.ts"

test("Test connection reads the feed once and counts its events; a page that isn't a calendar fails", async t => {
  const server = await IcsServer.start()
  t.after(() => server.close())
  server.serve("/cal.ics", "weekly.ics").text("/page", "<html></html>")
  assert.match(await PluginTestHost.testConfig(CalendarPlugin, { url: server.url("/cal.ics") }) ?? "", /^Read the calendar from 127\.0\.0\.1:\d+: \d+ events? from yesterday on$/)
  await assert.rejects(PluginTestHost.testConfig(CalendarPlugin, { url: server.url("/page") }))
})
