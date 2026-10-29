import assert from "node:assert/strict"
import net from "node:net"
import type { AddressInfo } from "node:net"
import { afterEach, describe, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TestClock } from "@lox-nexus/plugin-sdk/testing"
import { BrokerConnection } from "./broker/BrokerConnection.ts"
import { ConnectionHealth } from "./broker/ConnectionHealth.ts"
import { MqttHarness } from "./test-support/MqttHarness.ts"
import { SilentBroker } from "./test-support/SilentBroker.ts"

const { until, logs } = MqttHarness

/** a port nothing listens on */
async function closedPort() {
  const server = net.createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

describe("connection", { timeout: 20_000 }, () => {
  const harness = new MqttHarness()
  afterEach(() => harness.close())

  test("a refused login fails the start with a clear error", async () => {
    await harness.open({ credentials: { username: "nexus", password: "right" } })
    await assert.rejects(harness.start({ username: "nexus", password: "wrong" }), /refused the login: wrong user or password/)
    await assert.rejects(harness.start({}), /refused the login/)
    const host = await harness.start({ username: "nexus", password: "right" })
    assert.equal(host.status.status, "running")
    assert.ok(host.plugin.connection.connected)
  })

  test("the password is never logged, and not in the panel", async () => {
    await harness.open({ credentials: { username: "nexus", password: "s3cr3t-pw" } })
    await assert.rejects(harness.start({ username: "nexus", password: "s3cr3t-pw-wrong" }))
    const host = await harness.start({ username: "nexus", password: "s3cr3t-pw" })
    await host.panel()
    assert.doesNotMatch(JSON.stringify(host.sent), /s3cr3t/)
    assert.doesNotMatch(JSON.stringify(await host.panel()), /s3cr3t/)
  })

  test("an unreachable broker doesn't fail the start: degraded, retrying", async () => {
    const port = await closedPort()
    await harness.open()
    const host = await harness.start({ url: `mqtt://127.0.0.1:${port}` })
    assert.equal(host.status.status, "degraded")
    assert.match(host.status.message ?? "", /can't connect: connection refused: is the broker running on that host and port\?; retrying in 1 s/)
    assert.equal(logs(host, "warn").length, 1)
    const actuator = await host.addActuator("text", { topic: "a" })
    await assert.rejects(host.actuate(actuator, Value.string("x")), /not connected to the broker: connection refused/)
  })

  test("after the broker restarts: degraded while down, then running, resubscribed, values flow again", async () => {
    await harness.open()
    const host = await harness.connected()
    const temp = await host.addSensor("number", { topic: "home/temp" })
    await until(() => harness.broker.subscribed.includes("home/temp"))
    const old = harness.broker
    await old.close()
    await until(() => host.status.status === "degraded", 3000, "degraded")
    assert.match(host.status.message ?? "", /^disconnected: /)
    const broker = await harness.restartBroker()
    await until(() => broker.subscribed.includes("home/temp"), 5000, "the subscription again")
    assert.equal(host.status.status, "running")
    const next = host.next(temp)
    await broker.publish("home/temp", "22")
    assert.deepEqual(await next, Value.number(22))
    assert.ok(logs(host, "info").some(line => line.endsWith("again")))
  })

  test("MQTT over WebSocket", async () => {
    const broker = await harness.open({ websocket: true })
    const host = await harness.connected()
    const temp = await host.addSensor("number", { topic: "ws/t" })
    await until(() => broker.subscribed.includes("ws/t"))
    const next = host.next(temp)
    await broker.publish("ws/t", "3")
    assert.deepEqual(await next, Value.number(3))
  })

  test("a bad URL is refused by the config check", async () => {
    await harness.open()
    for (const url of ["http://broker:1883", "broker:1883", "mqtt://user:pw@broker:1883", "tcp://broker"]) {
      await assert.rejects(harness.start({ url }), Error, url)
    }
    for (const url of ["mqtts://broker.local:8883", "ws://broker:9001/mqtt", "wss://broker/mqtt"]) {
      const { MqttPlugin } = await import("./MqttPlugin.ts")
      assert.ok(MqttPlugin.config.safeParse({ url }).success, url)
    }
  })

  test("the client ID is kept across restarts, and a configured one wins", async () => {
    await harness.open()
    const store: Record<string, unknown> = {}
    const first = await harness.connected({}, { store, slug: "garage" })
    const id = first.plugin.clientId
    assert.match(id, /^lox-nexus-garage-[0-9a-f]{8}$/)
    await harness.stop(first)
    const second = await harness.connected({}, { store: { ...first.store }, slug: "garage" })
    assert.equal(second.plugin.clientId, id)
    await harness.stop(second)
    const fixed = await harness.connected({ clientId: "my-client" })
    assert.equal(fixed.plugin.clientId, "my-client")
  })

  test("a command the broker doesn't confirm fails after 10 s instead of waiting forever", async () => {
    await harness.open()
    const silent = await SilentBroker.start()
    const clock = new TestClock()
    try {
      const host = await harness.connected({ url: silent.url }, { clock })
      const out = await host.addActuator("switch", { topic: "plug/set", qos: "1" })
      const failed = assert.rejects(host.actuate(out, Value.boolean(true)), /the broker didn't confirm the message within 10 s/)
      await clock.advance(BrokerConnection.PUBLISH_TIMEOUT_MS)
      await failed
      assert.match(JSON.stringify(await host.panel()), /"Messages published","value":"0 \(failed 2\)"/, "the online status and the command")
    } finally {
      // the stop's own deadline (offline status, DISCONNECT) runs on the plugin's clock too
      let stopped = false
      const stopping = harness.cleanup().finally(() => (stopped = true))
      while (!stopped) await clock.advance(100)
      await stopping
      await silent.close()
    }
  })
})

test("a stop while still connecting ends the start instead of leaving it waiting", { timeout: 10_000 }, async t => {
  // accepts the connection but never answers it
  const sockets: net.Socket[] = []
  const server = net.createServer(socket => void sockets.push(socket.resume()))
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  const { port } = server.address() as AddressInfo
  const quiet = { debug() {}, info() {}, warn() {}, error() {} }
  const connection = new BrokerConnection({ url: `mqtt://127.0.0.1:${port}`, clientId: "x", rejectUnauthorized: true },
    new ConnectionHealth(quiet, { set() {} }, "test"))
  const started = connection.start()
  await until(() => sockets.length > 0, 3000, "the connection attempt")
  await connection.close(500)
  await connection.dispose()
  // resolves well before START_WAIT_MS would have ended it
  const outcome = await Promise.race([started.then(() => "ended"), new Promise(resolve => setTimeout(resolve, 1000, "still waiting"))])
  assert.equal(outcome, "ended")
})

