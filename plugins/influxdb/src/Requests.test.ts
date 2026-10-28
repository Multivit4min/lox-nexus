import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { InfluxHarness } from "./test-support/InfluxHarness.ts"

let harness: InfluxHarness
before(async () => (harness = await InfluxHarness.create()))
afterEach(async () => {
  await harness.cleanup()
  harness.influx.requests.length = 0
})
after(() => harness.close())

const TS = 1_793_606_400_000

test("v2: POST /api/v2/write with org, bucket, ms precision, the token and a gzipped body", async () => {
  const host = await harness.start({ batchSize: 1 })
  await host.pushValues([{ signalId: "t1", ts: TS, value: Value.number(21.5) }])
  const request = await harness.written(host, 1)
  assert.equal(request.method, "POST")
  assert.equal(request.path, "/api/v2/write")
  assert.deepEqual(request.query, { org: "home", bucket: "loxone", precision: "ms" })
  assert.equal(request.headers.authorization, `Token ${InfluxHarness.TOKEN}`)
  assert.equal(request.headers["content-encoding"], "gzip")
  assert.equal(request.headers["content-type"], "text/plain; charset=utf-8")
  assert.deepEqual(request.lines, [
    `lox_nexus,label=Living\\ room,owner=miniserver:ms1,signal_id=t1,topic=loxone/home/in/temperature,value_type=number value=21.5 ${TS}`
  ])
  assert.equal(host.plugin.stats.written, 1)
})

test("v1: POST /write with db, rp and basic auth; gzip off sends plain text", async () => {
  const host = await harness.start({
    api: "v1", org: undefined, bucket: undefined, token: undefined,
    database: "loxone", retentionPolicy: "one_year", username: "nexus", password: "pa:ss", gzip: false, batchSize: 1
  })
  await host.pushValues([{ signalId: "t1", ts: TS, value: Value.boolean(true) }])
  const request = await harness.written(host, 1)
  assert.equal(request.path, "/write")
  assert.deepEqual(request.query, { db: "loxone", rp: "one_year", precision: "ms" })
  assert.equal(request.headers.authorization, `Basic ${Buffer.from("nexus:pa:ss").toString("base64")}`)
  assert.equal(request.headers["content-encoding"], undefined)
  assert.match(request.body, / value=1 \d+$/)
})

test("v1 without a user sends no authorization; a path in the URL is kept as a prefix", async () => {
  const host = await harness.start({
    url: `${harness.influx.url}/influx/`, api: "v1", token: undefined, database: "loxone", batchSize: 1
  })
  await host.pushValues([{ signalId: "t1", ts: TS, value: Value.number(1) }])
  const request = await harness.written(host, 1)
  assert.equal(request.path, "/influx/write")
  assert.deepEqual(request.query, { db: "loxone", precision: "ms" })
  assert.equal(request.headers.authorization, undefined)
})

test("every value type reaches InfluxDB with its fields; null values are skipped", async () => {
  const host = await harness.start({ batchSize: 7, tagTopic: false, tagLabel: false, tagOwner: false })
  const values = [
    Value.number(-3.25), Value.string("say \"hi\""), Value.t5({ buttons: 2 }), Value.null(),
    Value.singleChannel({ channel: 40, fadeTime: 1 }), Value.tunableWhite({ brightness: 80, temperature: 3000, fadeTime: 0.2 }),
    Value.rgbw({ red: 100, green: 50, blue: 0, white: 10, fadeTime: 1, flags: 0 }), Value.boolean(false)
  ]
  await host.pushValues(values.map((value, i) => ({ signalId: "l1", ts: TS + i, value })))
  const request = await harness.written(host, 1)
  assert.deepEqual(request.lines, [
    `lox_nexus,signal_id=l1,value_type=number value=-3.25 ${TS}`,
    `lox_nexus,signal_id=l1,value_type=string text="say \\"hi\\"" ${TS + 1}`,
    `lox_nexus,signal_id=l1,value_type=t5 value=2 ${TS + 2}`,
    `lox_nexus,signal_id=l1,value_type=singleChannel brightness=40,fade_time=1 ${TS + 4}`,
    `lox_nexus,signal_id=l1,value_type=tunableWhite brightness=80,temperature=3000,fade_time=0.2 ${TS + 5}`,
    `lox_nexus,signal_id=l1,value_type=rgbw red=100,green=50,blue=0,white=10,fade_time=1 ${TS + 6}`,
    `lox_nexus,signal_id=l1,value_type=boolean value=0 ${TS + 7}`
  ])
  assert.equal(host.plugin.stats.skipped, 1)
})

test("forced values and commands are written; forced ones carry forced=true", async () => {
  const host = await harness.start({ batchSize: 2, measurement: "home data", tagTopic: false, tagOwner: false })
  await host.pushValues([
    { signalId: "t1", ts: TS, value: Value.number(5), forced: true },
    { signalId: "l1", ts: TS + 1, kind: "command", value: Value.number(1) }
  ])
  const request = await harness.written(host, 1)
  assert.deepEqual(request.lines, [
    `home\\ data,label=Living\\ room,signal_id=t1,value_type=number value=5,forced=true ${TS}`,
    `home\\ data,label=Kitchen\\ light,signal_id=l1,value_type=number value=1 ${TS + 1}`
  ])
})

test("initial values are written by default and skipped when writeInitial is off", async () => {
  const values = [
    { signalId: "t1", ts: TS, value: Value.number(20), initial: true as const },
    { signalId: "t1", ts: TS + 1, value: Value.number(21) }
  ]
  const on = await harness.start({ batchSize: 2 })
  await on.pushValues(values)
  assert.equal((await harness.written(on, 1)).lines.length, 2)
  const off = await harness.start({ batchSize: 1, writeInitial: false })
  await off.pushValues(values)
  assert.deepEqual((await harness.written(off, 2)).lines, [`lox_nexus,label=Living\\ room,owner=miniserver:ms1,signal_id=t1,topic=loxone/home/in/temperature,value_type=number value=21 ${TS + 1}`])
  assert.equal(harness.influx.requests.length, 2)
})

test("values of a signal not in the watch list are skipped and counted", async () => {
  const host = await harness.start({ batchSize: 1 })
  await host.pushValues([{ signalId: "unknown", ts: TS, value: Value.number(1) }, { signalId: "t1", ts: TS, value: Value.number(2) }])
  assert.deepEqual((await harness.written(host, 1)).lines.map(line => /signal_id=(\w+)/.exec(line)?.[1]), ["t1"])
  assert.equal(host.plugin.stats.skipped, 1)
})
