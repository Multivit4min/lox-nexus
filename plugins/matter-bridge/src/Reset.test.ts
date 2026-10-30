import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { DoorLockClient } from "@matter/main/behaviors/door-lock"
import type { BridgedLock } from "./devices/BridgedLock.ts"
import { BridgeHarness } from "./test-support/BridgeHarness.ts"
import { TestController } from "./test-support/TestController.ts"

const { until } = BridgeHarness
let bridge: BridgeHarness

before(async () => {
  bridge = await BridgeHarness.start([{ name: "Front door", type: "door-lock", allowUnlock: true }, { name: "Kitchen", type: "plug" }])
})
after(() => bridge.close())

const allowUnlockOnEndpoint = () => (bridge.state("Front door").doorLock as { allowUnlock: boolean }).allowUnlock

test("after the factory reset (last controller removed), a lock forbidden to unlock stays forbidden and a rename stays", { timeout: 40_000 }, async () => {
  const { host } = bridge
  await bridge.pair()
  const request = await host.addSensor("lock", { device: "Front door" })
  await host.action("edit-device", { device: "Front door", name: "Front door", allowUnlock: false })
  await host.action("edit-device", { device: "Kitchen", name: "Pantry" })
  await host.action("remove-pairing", { fabricIndex: host.plugin.bridge.controllers()[0]!.fabricIndex })
  await until(() => host.plugin.bridge.pairing()?.commissioned === false, 10_000, "the reset")

  // the reset rebuilt the endpoints as they were created (unlocking allowed, "Kitchen"); the bridge set them again
  await until(() => allowUnlockOnEndpoint() === false, 3000, "unlocking forbidden again")
  assert.equal(bridge.state("Kitchen").bridgedDeviceBasicInformation?.nodeLabel, "Pantry")

  const again = await bridge.pair()
  assert.equal((TestController.device(again, "Pantry").state as unknown as { bridgedDeviceBasicInformation: { nodeLabel: string } }).bridgedDeviceBasicInformation.nodeLabel, "Pantry")
  await assert.rejects(TestController.device(again, "Front door").commandsOf(DoorLockClient).unlockDoor({}), /FAILURE|Failure|failure/)
  assert.deepEqual(bridge.values(request), [], "nothing reached the sensor")
})

test("an unlock request is dropped (with a warning) even if the endpoint's flag were out of step with the device", { timeout: 20_000 }, async () => {
  const { host } = bridge
  const peer = await TestController.start()
  try {
    // the reset test left the bridge paired with the harness controller; this test pairs a second one
    await host.action("open-pairing-window")
    const node = await peer.pair(host.plugin.bridge.pairing()!.manualCode)
    const request = await host.addSensor("lock", { device: "Front door" })
    await (host.plugin.devices.get("Front door") as BridgedLock).endpoint.set({ doorLock: { allowUnlock: true } })
    await TestController.device(node, "Front door").commandsOf(DoorLockClient).unlockDoor({})
    await until(() => host.sent.some(message => message.type === "log" && message.message.startsWith("dropped an unlock request for \"Front door\"")), 3000, "the warning")
    assert.deepEqual(bridge.values(request), [])
  } finally {
    await peer.close()
  }
})
