import assert from "node:assert/strict"
import { test } from "node:test"
import type { MdnsService } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { HomeAssistantPlugin } from "../HomeAssistantPlugin.ts"
import { ServerFinder } from "./ServerFinder.ts"

const server = (txt: Record<string, string>, addresses = ["192.0.2.10"]): MdnsService => ({
  name: "Home._home-assistant._tcp.local", host: "homeassistant.local", port: 8123, addresses, txt
})

test("Find offers each server by its name, with the internal URL, else the base URL, else its address or host name", async () => {
  const asked: string[] = []
  const finder = new ServerFinder(async type => {
    asked.push(type)
    return [
      server({ location_name: "Home", version: "2026.10.1", internal_url: "http://192.0.2.10:8123/", base_url: "https://ha.example.org" }),
      server({ base_url: "http://192.0.2.11:8123", internal_url: "" }),
      server({}, ["2001:db8::1", "192.0.2.12"]),
      server({}, ["2001:db8::2"]),
      server({}, ["fe80::1"]),
      { ...server({}, []), name: "Home on ha.lan._home-assistant._tcp.local" }
    ]
  })
  assert.deepEqual(await finder.find(), [
    { label: "Home", value: "http://192.0.2.10:8123", detail: "Home Assistant 2026.10.1 · http://192.0.2.10:8123" },
    { label: "Home", value: "http://192.0.2.11:8123", detail: "Home Assistant · http://192.0.2.11:8123" },
    { label: "Home", value: "http://192.0.2.12:8123", detail: "Home Assistant · http://192.0.2.12:8123" },
    { label: "Home", value: "http://[2001:db8::2]:8123", detail: "Home Assistant · http://[2001:db8::2]:8123" },
    { label: "Home", value: "http://homeassistant.local:8123", detail: "Home Assistant · http://homeassistant.local:8123" },
    { label: "Home on ha.lan", value: "http://homeassistant.local:8123", detail: "Home Assistant · http://homeassistant.local:8123" }
  ])
  assert.deepEqual(asked, ["_home-assistant._tcp.local"])
})

test("the URL field has Find; nothing else does", async () => {
  assert.deepEqual((await PluginTestHost.describe(HomeAssistantPlugin)).discoverable, ["url"])
})
