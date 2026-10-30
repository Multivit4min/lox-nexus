import type { LogLevel, PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import type { ValueType } from "@lox-nexus/plugin-sdk/values"
import type { SignalDisplay } from "../wires/SignalDisplay.ts"

/** A plugin that can be run: where its entry module is and what it offers. */
export interface PluginPackage {
  /** topic segment and stable reference, e.g. "fronius" */
  id: string
  name: string
  /** absolute path or file URL of the module that calls PluginEntry.define() */
  entry: string
  /** the installed version, for messages; development copies have none */
  version?: string
  description: PluginDescription
  /** the worker's heap limit from the manifest (`loxNexus.heapMb`); default 128 MB */
  heapMb?: number
}

/** One configured instance of a plugin. */
export interface PluginInstanceConfig {
  id: string
  /** PluginPackage.id */
  plugin: string
  /** topic segment, unique across all instances: <plugin>/<slug>/… and system/plugin/<slug>/… */
  slug: string
  label: string
  config: unknown
  enabled: boolean
}

/** A configured sensor or actuator of an instance. */
export interface PluginSignalConfig extends SignalDisplay {
  id: string
  kind: "sensor" | "actuator"
  /** the Sensor or Actuator class id */
  capability: string
  params: unknown
  label: string
  /** last topic segment */
  slug: string
}

/** Lifecycle of an instance as the host sees it. */
export type PluginState = "stopped" | "starting" | "running" | "degraded" | "error" | "crashed" | "stopping"

/** Where an instance's store writes go; the host persists them. */
export interface PluginStateStore {
  load(instanceId: string): Record<string, unknown>
  set(instanceId: string, key: string, value: unknown): void
  delete(instanceId: string, key: string): void
}

/** Where plugin log lines go, tagged with their instance. */
export interface PluginLogSink {
  log(instance: Pick<PluginInstanceConfig, "id" | "slug">, level: LogLevel, message: string, data?: unknown): void
  /** the lowest level kept for the instance; the worker then doesn't send lines below it. Without it, all are sent */
  level?(instanceId: string): LogLevel
  /** calls `listener` when the instance's level changes; @returns the unsubscribe */
  onLevel?(instanceId: string, listener: (level: LogLevel) => void): () => void
}

/** The value type a configured signal carries, from the plugin's description. */
export type SignalValueType = ValueType | "any"
