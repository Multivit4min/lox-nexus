import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { Poller, type PollPart } from "./Poller.ts"
import { SolarApi } from "./SolarApi.ts"
import type { FroniusSnapshot } from "./SolarApiTypes.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"
import { waitFor } from "./test-support/waitFor.ts"

describe("Poller", () => {
  let server: FixtureServer
  before(async () => (server = await FixtureServer.start()))
  after(() => server.close())

  const poller = () => {
    const reports: [PollPart, string | undefined][] = []
    const instance = new Poller(new SolarApi(server.url, 2000), (part, problem) => reports.push([part, problem]))
    const data: FroniusSnapshot[] = []
    instance.on("data", snapshot => data.push(snapshot))
    return { instance, reports, data }
  }

  test("reads all three endpoints into one snapshot and emits it", async () => {
    server.gen24()
    const { instance, data, reports } = poller()
    await instance.poll()
    assert.equal(data.length, 1)
    assert.equal(data[0], instance.latest)
    assert.equal(instance.latest?.powerflow.Site.P_PV, 3080.4)
    assert.equal(instance.latest?.meter?.["0"]?.Frequency_Phase_Average, 50)
    assert.equal(instance.latest?.storage?.["0"]?.Controller.Temperature_Cell, 24.5)
    assert.ok(instance.lastSuccess)
    assert.deepEqual(reports, [], "nothing to report while all is well")
    await instance.dispose()
  })

  test("a poll requested while one runs joins it instead of overlapping", async () => {
    server.gen24()
    const { instance, data } = poller()
    const start = server.requests.length
    const release = server.hold()
    const first = instance.poll()
    const second = instance.poll()
    assert.equal(first, second)
    await waitFor(() => server.requests.length === start + 3)
    release()
    await Promise.all([first, second])
    assert.equal(data.length, 1)
    await instance.poll()
    assert.equal(server.requests.length, start + 6, "the next poll starts once the first finished")
    await instance.dispose()
  })

  test("meter and storage are optional; their problems are reported once, not every poll", async () => {
    server.produceOnly()
    const { instance, reports } = poller()
    await instance.poll()
    await instance.poll()
    assert.deepEqual(instance.latest?.meter, {})
    assert.equal(instance.latest?.storage, undefined)
    assert.deepEqual(reports, [["storage", "GetStorageRealtimeData: HTTP 404"]])
    assert.equal(instance.problem, undefined)
    await instance.dispose()
  })

  test("a failing power flow keeps the last snapshot and reports the problem until it recovers", async () => {
    server.gen24()
    const { instance, reports, data } = poller()
    await instance.poll()
    server.fail("GetPowerFlowRealtimeData")
    await instance.poll()
    await instance.poll()
    assert.equal(data.length, 1, "a failed poll emits nothing")
    assert.equal(instance.latest?.powerflow.Site.P_PV, 3080.4)
    assert.equal(instance.problem, "GetPowerFlowRealtimeData: HTTP 500")
    assert.equal(instance.lastError?.message, "GetPowerFlowRealtimeData: HTTP 500")
    server.gen24()
    await instance.poll()
    assert.deepEqual(reports, [["powerflow", "GetPowerFlowRealtimeData: HTTP 500"], ["powerflow", undefined]])
    assert.equal(data.length, 2)
    await instance.dispose()
  })

  test("dispose aborts the poll in flight and waits for it", async () => {
    server.gen24()
    const { instance, data, reports } = poller()
    const start = server.requests.length
    const release = server.hold()
    const running = instance.poll()
    await waitFor(() => server.requests.length === start + 3)
    await instance.dispose()
    release()
    await running
    assert.deepEqual([data, reports], [[], []], "nothing is emitted or reported after dispose")
    await instance.poll()
    assert.equal(instance.latest, undefined, "a disposed poller doesn't poll")
  })
})
