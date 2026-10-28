import { Plugin } from "@lox-nexus/plugin-sdk"
import type { WatchedValue } from "@lox-nexus/plugin-sdk/wire"

/** A plugin that watches signals and keeps what it got, as "label=value" lines, for the host tests. */
export class ExporterPlugin extends Plugin {
  static readonly watches = { label: "Exported signals" }

  override watched(values: readonly WatchedValue[], dropped: number) {
    const lines = values.map(v => `${this.watch.signal(v.signalId)?.label ?? v.signalId}=${v.value.type === "number" ? v.value.value : v.value.type}${v.initial ? " (initial)" : ""}${v.forced ? " (forced)" : ""}`)
    const before = this.store.get<string[]>("got") ?? []
    this.store.set("got", [...before, ...lines, ...(dropped ? [`dropped ${dropped}`] : [])])
  }
}
