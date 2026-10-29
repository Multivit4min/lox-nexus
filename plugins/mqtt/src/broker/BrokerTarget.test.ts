import assert from "node:assert/strict"
import { test } from "node:test"
import { BrokerTarget } from "./BrokerTarget.ts"

test("URLs become MQTT.js options; WebSocket URLs keep their path", () => {
  assert.deepEqual(BrokerTarget.options("mqtt://broker.local"), { protocol: "mqtt", hostname: "broker.local", host: "broker.local" })
  assert.deepEqual(BrokerTarget.options("mqtts://10.0.0.2:8884/ignored"), { protocol: "mqtts", hostname: "10.0.0.2", host: "10.0.0.2", port: 8884 })
  assert.deepEqual(BrokerTarget.options("wss://ha.local/mqtt?x=1"), { protocol: "wss", hostname: "ha.local", host: "ha.local", path: "/mqtt?x=1" })
  // MQTT.js joins the WebSocket URL from the hostname, so an IPv6 address keeps its brackets there, and loses them for TCP
  assert.deepEqual(BrokerTarget.options("ws://[::1]:9001"), { protocol: "ws", hostname: "[::1]", host: "[::1]", port: 9001, path: "/" })
  assert.deepEqual(BrokerTarget.options("mqtt://[fd00::5]:1883"), { protocol: "mqtt", hostname: "fd00::5", host: "fd00::5", port: 1883 })
})

test("the panel shows scheme, host, port and path", () => {
  assert.equal(BrokerTarget.describe("mqtt://broker:1883"), "mqtt://broker:1883")
  assert.equal(BrokerTarget.describe("wss://ha.local/mqtt?token=x"), "wss://ha.local/mqtt")
})
