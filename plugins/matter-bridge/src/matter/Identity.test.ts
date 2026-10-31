import assert from "node:assert/strict"
import { test } from "node:test"
import { PairingPanel } from "../panel/PairingPanel.ts"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { BridgeIdentity } from "./BridgeIdentity.ts"
import { PairingSecrets } from "./PairingSecrets.ts"
import { Vendors } from "./Vendors.ts"

test("the bridge has real versions and a serial number that differs from its unique id", () => {
  const info = new BridgeIdentity("instance-1", "Lox Nexus").basicInformation()
  assert.equal(info.softwareVersion, 100)
  assert.equal(info.softwareVersionString, BridgeIdentity.VERSION)
  assert.equal(info.hardwareVersion, 1)
  assert.notEqual(info.serialNumber, info.uniqueId)
  assert.ok(!"Lox Nexus".includes(info.vendorName), "matter.js warns when the product label contains the vendor name")
  assert.deepEqual(new BridgeIdentity("instance-1", "Other").basicInformation().uniqueId, info.uniqueId, "stable per instance")
  assert.equal(BridgeIdentity.softwareVersion("1.2.3"), 10203)
})

test("the pairing secrets are chosen once, valid, and kept", () => {
  const store = new MemoryStore()
  const secrets = new PairingSecrets(store).get()
  assert.ok(PairingSecrets.valid(secrets))
  assert.deepEqual(new PairingSecrets(store).get(), secrets)
  store.set(PairingSecrets.KEY, { passcode: 12345678, discriminator: 1 })
  assert.notEqual(new PairingSecrets(store).get().passcode, 12345678, "a forbidden passcode is replaced")
})

test("controllers are named by vendor; codes are grouped as the apps print them", () => {
  assert.equal(Vendors.describe("", 0x1217), "Amazon Alexa")
  assert.equal(Vendors.describe("Home", 0x1217), "Home")
  assert.equal(Vendors.describe("", 0x1234), "vendor 0x1234")
  assert.equal(PairingPanel.groupCode("34970112332"), "3497-011-2332")
})
