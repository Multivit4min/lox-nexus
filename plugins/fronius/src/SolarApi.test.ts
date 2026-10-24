import assert from "node:assert/strict"
import { after, before, beforeEach, describe, test } from "node:test"
import { SolarApi } from "./SolarApi.ts"
import { FixtureServer } from "./test-support/FixtureServer.ts"

describe("SolarApi", () => {
  let server: FixtureServer
  let api: SolarApi
  before(async () => {
    server = await FixtureServer.start()
    api = new SolarApi(server.url, 2000)
  })
  beforeEach(() => server.gen24())
  after(() => server.close())

  test("returns Body.Data of each endpoint, asking the whole system for meters and storages", async () => {
    assert.equal((await api.powerFlow()).Site.P_PV, 3080.4)
    assert.equal((await api.meters())["0"]?.PowerReal_P_Sum, -1180.6)
    assert.equal((await api.storages())["0"]?.Controller.StateOfCharge_Relative, 63.2)
    assert.ok(server.requests.includes("/solar_api/v1/GetMeterRealtimeData.cgi?Scope=System"))
    assert.ok(server.requests.includes("/solar_api/v1/GetStorageRealtimeData.cgi?Scope=System"))
  })

  test("device 0 is a device, not the whole system", async () => {
    server.serve("GetMeterRealtimeData?Scope=Device&DeviceId=0", "meter-device-0")
    const meter = await api.meter(0)
    assert.equal(meter.PowerReal_P_Sum, -1180.6)
    assert.equal(server.requests.at(-1), "/solar_api/v1/GetMeterRealtimeData.cgi?Scope=Device&DeviceId=0")
    assert.throws(() => api.storage(-1), /device id must be an integer >= 0/)
  })

  test("accepts JSON with a charset and refuses other content types", async () => {
    server.serve("GetPowerFlowRealtimeData", "powerflow-gen24", "application/json; charset=utf-8")
    assert.equal((await api.powerFlow()).Site.Mode, "bidirectional")
    server.serve("GetPowerFlowRealtimeData", "powerflow-gen24", "text/html")
    await assert.rejects(api.powerFlow(), { message: 'GetPowerFlowRealtimeData: expected application/json, got "text/html"' })
  })

  test("errors name the endpoint and the reason", async () => {
    server.fail("GetPowerFlowRealtimeData", 503)
    await assert.rejects(api.powerFlow(), { message: "GetPowerFlowRealtimeData: HTTP 503" })
    server.serve("GetStorageRealtimeData", "status-error")
    await assert.rejects(api.storages(), { message: "GetStorageRealtimeData: device answered with status 255 (Storage not supported)" })
    server.serve("GetPowerFlowRealtimeData", "empty-system")
    await assert.rejects(api.powerFlow(), /GetPowerFlowRealtimeData: unexpected response/)
  })

  test("a request that takes too long is aborted", async () => {
    const release = server.hold()
    await assert.rejects(new SolarApi(server.url, 50).powerFlow(), { message: "GetPowerFlowRealtimeData: no answer within 0.05 s" })
    release()
  })

  test("an unreachable host is reported as such", async () => {
    const gone = await FixtureServer.start()
    const url = gone.url
    await gone.close()
    await assert.rejects(new SolarApi(url, 2000).powerFlow(), /^Error: GetPowerFlowRealtimeData: unreachable \(.*ECONNREFUSED/)
  })

  test("a path in the host is kept, for inverters behind a reverse proxy", async () => {
    await assert.rejects(new SolarApi(`${server.url}/fronius/`, 2000).powerFlow(), /HTTP 404/)
    assert.equal(server.requests.at(-1), "/fronius/solar_api/v1/GetPowerFlowRealtimeData.fcgi")
  })
})
