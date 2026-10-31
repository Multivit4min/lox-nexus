import assert from "node:assert/strict"
import { test } from "node:test"
import type { MdnsService } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { MqttPlugin } from "../MqttPlugin.ts"
import { BrokerFinder } from "./BrokerFinder.ts"

const broker = (name: string, port: number, addresses: string[]): MdnsService => ({ name: `${name}._mqtt._tcp.local`, host: "nas.local", port, addresses, txt: {} })

test("Find offers plain brokers by address and TLS ones by host name, as the certificate names it", async () => {
  const finder = new BrokerFinder(async type => type === "_mqtt._tcp.local"
    ? [broker("Mosquitto", 1883, ["2001:db8::5", "192.0.2.5"]), broker("Other", 1884, ["2001:db8::6"]), broker("Unresolved", 1885, []), broker("Mosquitto on nas.lan", 1886, ["fe80::1"])]
    : [broker("Secure", 8883, ["192.0.2.5"])])
  assert.deepEqual((await finder.find()).map(entry => [entry.label, entry.value]), [
    ["Mosquitto", "mqtt://192.0.2.5:1883"],
    ["Other", "mqtt://[2001:db8::6]:1884"],
    ["Unresolved", "mqtt://nas.local:1885"],
    ["Mosquitto on nas.lan", "mqtt://nas.local:1886"],
    ["Secure", "mqtts://nas.local:8883"]
  ])
})

test("the broker URL has Find", async () => {
  assert.deepEqual((await PluginTestHost.describe(MqttPlugin)).discoverable, ["url"])
})
