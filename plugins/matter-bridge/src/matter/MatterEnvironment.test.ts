import assert from "node:assert/strict"
import { test } from "node:test"
import { Environment, Filesystem, StorageService } from "@matter/main"
import { MemoryStore } from "../test-support/MemoryStore.ts"
import { MatterEnvironment } from "./MatterEnvironment.ts"
import { StoreStorageDriver } from "./StoreStorageDriver.ts"

test("matter.js sees no file system, although the default environment has one, and stores in the plugin store", async () => {
  assert.ok(Environment.default.has(Filesystem), "Node's default environment has a file system")
  const store = new MemoryStore()
  const matter = new MatterEnvironment(store, {})
  assert.equal(matter.env.has(Filesystem), false)
  assert.equal(matter.env.get(StorageService).hasFilesystem, false)
  assert.equal(matter.hasFilesystem, false)

  const manager = await matter.env.get(StorageService).open("bridge")
  const context = manager.createContext("root")
  await context.set("label", "Lox Nexus")
  await manager.close()
  assert.deepEqual(store.get("matter:bridge/root"), { context: "root", json: "{\"label\":\"Lox Nexus\"}" })
  assert.ok(StoreStorageDriver.PREFIX)
  matter.close()
})
