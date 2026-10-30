import assert from "node:assert/strict"
import { test } from "node:test"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { StoreStorageDriver } from "./StoreStorageDriver.ts"
import { WriteCoalescer } from "./WriteCoalescer.ts"

test("values survive a new driver on the same store, Uint8Array and bigint included", () => {
  const store = new MemoryStore()
  const first = new StoreStorageDriver(store, "bridge")
  first.set(["root", "fabrics"], "key", new Uint8Array([1, 2, 255]))
  first.set(["root", "fabrics"], { id: 12345678901234567890n, label: "Alexa" })
  first.set(["sessions"], "resumption", [{ peer: 1n }])

  const second = new StoreStorageDriver(store, "bridge")
  assert.deepEqual(second.get(["root", "fabrics"], "key"), new Uint8Array([1, 2, 255]))
  assert.equal(second.get(["root", "fabrics"], "id"), 12345678901234567890n)
  assert.equal(second.get(["root", "fabrics"], "label"), "Alexa")
  assert.deepEqual(second.get(["sessions"], "resumption"), [{ peer: 1n }])
  assert.ok(second.initialized, "initialized by the constructor, as matter.js expects of a created driver")
})

test("one store key per context, namespaced; deleting the last value deletes the key", () => {
  const store = new MemoryStore()
  const driver = new StoreStorageDriver(store, "bridge")
  driver.set(["root", "basicInformation"], "nodeLabel", "Lox Nexus")
  driver.set(["root"], "number", 0)
  assert.deepEqual(store.keys().sort(), ["matter:bridge/root", "matter:bridge/root.basicInformation"])
  assert.deepEqual(store.get("matter:bridge/root"), { context: "root", json: "{\"number\":0}" })

  driver.delete(["root"], "number")
  assert.deepEqual(store.keys(), ["matter:bridge/root.basicInformation"])
  // another namespace (a second node) neither sees nor clears it
  assert.equal(new StoreStorageDriver(store, "other").get(["root", "basicInformation"], "nodeLabel"), undefined)
})

test("clearAll removes a context and those below it, or everything of the namespace", () => {
  const store = new MemoryStore()
  store.set("unrelated", 1)
  const driver = new StoreStorageDriver(store, "bridge")
  driver.set(["root"], "a", 1)
  driver.set(["root", "parts"], "b", 2)
  driver.set(["rootless"], "c", 3)
  driver.clearAll(["root"])
  assert.deepEqual(store.keys().sort(), ["matter:bridge/rootless", "unrelated"])
  assert.equal(driver.get(["root", "parts"], "b"), undefined)

  driver.set(["root"], "a", 1)
  driver.clearAll([])
  assert.deepEqual(store.keys(), ["unrelated"])
})

test("context paths too long for a store key are hashed, and still read back", () => {
  const store = new MemoryStore()
  const contexts = Array.from({ length: 30 }, (_, index) => `segment${index}`)
  const driver = new StoreStorageDriver(store, "bridge")
  driver.set(contexts, "value", "deep")
  const [key] = store.keys()
  assert.ok(key && key.length <= StoreStorageDriver.MAX_KEY && key.includes("#"), key)
  assert.equal(new StoreStorageDriver(store, "bridge").get(contexts, "value"), "deep")
  driver.clearAll(contexts.slice(0, 3))
  assert.deepEqual(store.keys(), [])
})

test("a context close to the store's limit is reported", () => {
  const warnings: string[] = []
  const driver = new StoreStorageDriver(new MemoryStore(), "bridge", { warn: message => warnings.push(message) })
  driver.set(["big"], "blob", "x".repeat(StoreStorageDriver.WARN_LENGTH))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0]!, /"big" holds 900 KiB/)
  // measured like the store measures: the stored value as JSON
  driver.set(["big"], "blob", "x".repeat(StoreStorageDriver.WARN_LENGTH - 60))
  assert.equal(warnings.length, 1)
})

test("entries an older or broken version left are skipped with a warning, not a failed start", () => {
  const store = new MemoryStore()
  store.set("matter:bridge/root", "not an entry")
  store.set("matter:bridge/sessions", { context: "sessions", json: "{broken" })
  store.set("matter:bridge/fabrics", { context: "fabrics", json: "{\"a\":1}" })
  const warnings: string[] = []
  const driver = new StoreStorageDriver(store, "bridge", { warn: message => warnings.push(message) })
  assert.deepEqual(driver.keys(["root"]), [])
  assert.deepEqual(driver.keys(["sessions"]), [])
  assert.equal(driver.get(["fabrics"], "a"), 1)
  assert.equal(warnings.length, 2)
  assert.match(warnings[1]!, /matter:bridge\/sessions/)
})

test("device attribute state goes through the coalescer; fabrics and endpoint numbers are written at once", async () => {
  const store = new MemoryStore()
  const scheduled: (() => void)[] = []
  const coalescer = new WriteCoalescer((_ms, run) => {
    scheduled.push(run)
    return () => {}
  })
  const driver = new StoreStorageDriver(store, "bridge", { coalescer })
  driver.set(["root", "operationalCredentials"], "fabrics", ["x"])
  driver.set(["root", "parts", "devices", "parts", "blind"], "__number__", 3)
  assert.equal(store.writes, 2, "fabrics and the endpoint number at once")
  store.writes = 1
  for (let position = 0; position <= 2000; position += 100) driver.set(["root", "parts", "devices", "parts", "blind", "windowCovering"], "position", position)
  assert.equal(store.writes, 1, "nothing yet")
  scheduled[0]!()
  assert.equal(store.writes, 2, "21 positions, one write")
  assert.match(store.get<{ json: string }>("matter:bridge/root.parts.devices.parts.blind.windowCovering")!.json, /2000/)
  driver.set(["root", "parts", "devices", "parts", "blind", "windowCovering"], "position", 0)
  await driver.close()
  assert.equal(store.writes, 3, "close writes what is pending")
})
