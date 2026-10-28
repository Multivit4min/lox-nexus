import assert from "node:assert/strict"
import { test } from "node:test"
import { Plugin } from "../plugin/Plugin.ts"
import { PluginTestHost } from "../testing/PluginTestHost.ts"
import { Value } from "../values/Value.ts"
import type { WatchedValue } from "../wire/WatchShapes.ts"
import { PluginDescriber } from "./PluginDescriber.ts"

class Exporter extends Plugin {
  static readonly watches = { label: "Exported signals", description: "Written somewhere" }
  readonly batches: Array<{ values: string[]; dropped: number }> = []
  changed = 0
  slow: Promise<void> | undefined

  override async watched(values: readonly WatchedValue[], dropped: number) {
    await this.slow
    if (values.some(v => v.signalId === "boom")) throw new Error("export failed")
    this.batches.push({ values: values.map(v => `${this.watch.signal(v.signalId)?.label ?? v.signalId}=${JSON.stringify(v.value.type === "number" ? v.value.value : v.value)}`), dropped })
  }

  override watchChanged() {
    this.changed++
  }
}

test("a watching plugin declares it, gets the chosen signals and their values in order, and acks each batch", async () => {
  assert.deepEqual(PluginDescriber.describe(Exporter).watches, { label: "Exported signals", description: "Written somewhere" })
  const host = await PluginTestHost.start(Exporter)
  const exporter = host.plugin
  await host.watchSignals([{ id: "t", topic: "loxone/home/in/t", label: "Temperature", valueType: "number" }])
  assert.deepEqual([exporter.changed, exporter.watch.signals().map(s => s.id)], [1, ["t"]])
  let release!: () => void
  exporter.slow = new Promise(resolve => (release = resolve))
  const first = host.pushValues([{ signalId: "t", value: Value.number(1) }])
  const second = host.pushValues([{ signalId: "t", value: Value.number(2) }], 3)
  release()
  await Promise.all([first, second])
  assert.deepEqual(exporter.batches, [{ values: ["Temperature=1"], dropped: 0 }, { values: ["Temperature=2"], dropped: 3 }], "one batch after the other")
  await host.pushValues([{ signalId: "boom", value: Value.number(0) }])
  assert.ok(host.sent.some(m => m.type === "log" && m.level === "error" && m.message.includes("export failed")), "a throw is logged, and still acked")
  await host.stop()
})

test("plugins without the declaration describe none, and their view is empty", async () => {
  class Plain extends Plugin {}
  assert.equal("watches" in PluginDescriber.describe(Plain), false)
  const host = await PluginTestHost.start(Plain)
  assert.deepEqual(host.plugin.watch.signals(), [])
  await host.stop()
})

test("a new list waits for the batches sent before it; shutdown waits for a running batch", async () => {
  const host = await PluginTestHost.start(Exporter)
  const exporter = host.plugin
  await host.watchSignals([{ id: "t", topic: "t", label: "Old", valueType: "number" }])
  let release!: () => void
  exporter.slow = new Promise(resolve => (release = resolve))
  const batch = host.pushValues([{ signalId: "t", value: Value.number(1) }])
  const relabel = host.watchSignals([{ id: "t", topic: "t", label: "New", valueType: "number" }])
  const stopping = host.stop()
  release()
  await Promise.all([batch, relabel, stopping])
  assert.deepEqual(exporter.batches.map(b => b.values), [["Old=1"]], "the batch met the list it was sent with")
  assert.equal(exporter.isDisposed, true)
})

test("an invalid declaration is refused, not silently ignored", () => {
  class Unnamed extends Plugin {
    static readonly watches = { label: "" }
  }
  assert.throws(() => PluginDescriber.describe(Unnamed), /watches needs a label/)
})

