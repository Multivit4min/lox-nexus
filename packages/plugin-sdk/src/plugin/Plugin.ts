import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { CatalogNode, Panel } from "../wire/Shapes.ts"
import type { ActuatorClass } from "./Actuator.ts"
import type { PluginContext } from "./PluginContext.ts"
import type { SensorClass } from "./Sensor.ts"

/**
 * Base class of a plugin. One instance runs per configured plugin instance, in its own worker.
 *
 * Subclasses declare what they offer as static fields (see PluginClass; all optional) and do
 * their work in start(); everything registered with own(), every(), after() or listen() is
 * cleaned up when the instance stops:
 *
 * ```ts
 * export class FroniusPlugin extends Plugin<FroniusConfig> {
 *   static readonly config = froniusConfigSchema
 *   static readonly sensors = [ValueSensor]
 *   readonly poller = this.own(new Poller(() => this.config.host))
 *   override start() { this.every(5000, () => this.poller.poll()) }
 * }
 * ```
 */
export abstract class Plugin<Config = unknown> extends Disposable {
  /** Field initializers of subclasses run after this, so they can already use `this.config`. */
  constructor(protected readonly context: PluginContext) {
    super()
  }

  get config(): Config {
    return this.context.config as Config
  }

  get log() {
    return this.context.log
  }

  get store() {
    return this.context.store
  }

  get status() {
    return this.context.status
  }

  get http() {
    return this.context.http
  }

  /** Starts the work; a rejection puts the instance into the error state (no restart). */
  start(): void | Promise<void> {}

  /** Optional tree of ready-to-add sensors and actuators, e.g. built from the device's data. */
  catalog(): CatalogNode[] | Promise<CatalogNode[]> {
    return []
  }

  /** Optional status view for the plugin's page; undefined shows nothing. */
  panel(): Panel | undefined | Promise<Panel | undefined> {
    return undefined
  }
}

/**
 * The static side of a plugin class, as the runtime sees it. The declarations are static fields
 * of the subclass rather than of Plugin, so subclasses don't need `override` on them.
 */
export type PluginClass = (new (context: PluginContext) => Plugin) & {
  readonly name: string
  /** the instance config schema; default: no config (an empty object) */
  readonly config?: z.ZodType
  readonly sensors?: readonly SensorClass[]
  readonly actuators?: readonly ActuatorClass[]
}
