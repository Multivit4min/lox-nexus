import type { PluginInstanceConfig, PluginSignalConfig } from "./PluginTypes.ts"

/** Topics of one plugin instance: <plugin>/<instance>/{sensor,actuator}/<signal> and its system topics. */
export class PluginTopics {
  constructor(private readonly instance: Pick<PluginInstanceConfig, "plugin" | "slug">) {}

  forSignal(signal: Pick<PluginSignalConfig, "kind" | "slug">) {
    return `${this.instance.plugin}/${this.instance.slug}/${signal.kind}/${signal.slug}`
  }

  /** lifecycle state: stopped, starting, running, degraded, error, crashed, stopping */
  get status() {
    return `system/plugin/${this.instance.slug}/status`
  }

  /** problems: crashes, failed signals, a degraded status message */
  get errors() {
    return `system/plugin/${this.instance.slug}/error`
  }
}
