import type { z } from "zod"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { CatalogNode, Panel } from "../wire/Shapes.ts"
import type { ActuatorClass } from "./Actuator.ts"
import type { PluginContext } from "./PluginContext.ts"
import type { SensorClass } from "./Sensor.ts"

/**
 * Base class of a plugin. One instance runs per configured plugin instance, in its own worker
 * thread, so a plugin that crashes or hangs affects nothing else. Extend it, declare the static
 * fields below, and export the class with PluginEntry.define().
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

  /** The instance config, already validated against the static `config` schema (defaults applied). */
  get config(): Config {
    return this.context.config as Config
  }

  /** Shortcut for `context.log`. */
  get log() {
    return this.context.log
  }

  /** Shortcut for `context.store`. */
  get store() {
    return this.context.store
  }

  /** Shortcut for `context.status`. */
  get status() {
    return this.context.status
  }

  /**
   * The instance's slug, e.g. to show its webhook URL (`/hook/<slug>/…`); undefined with hosts that
   * don't send it. A slug change restarts the instance, so it is fixed for one run.
   */
  get slug() {
    return this.context.slug
  }

  /** Shortcut for `context.http`; routes are unauthenticated, see PluginHttp. */
  get http() {
    return this.context.http
  }

  /**
   * Starts the work. Reject only for problems a restart can't fix (invalid credentials, a missing
   * device): the instance goes into the error state and is not restarted. For a device that is
   * merely unreachable, resolve and report `status.set("degraded", ...)` while retrying.
   */
  start(): void | Promise<void> {}

  /**
   * Optional tree of ready-to-add sensors and actuators, e.g. built from the device's data. Asked
   * on demand by the UI, so it may query the device; a throw is shown to the user as the error.
   */
  catalog(): CatalogNode[] | Promise<CatalogNode[]> {
    return []
  }

  /** Optional status view for the plugin's page, asked on demand; undefined shows nothing. */
  panel(): Panel | undefined | Promise<Panel | undefined> {
    return undefined
  }

  /**
   * A promise in this worker was rejected and nobody handled it (a forgotten `.catch`). The worker
   * keeps running; by default the reason is logged as an error with its stack. Override it to say
   * more, e.g. which line of user code it came from, or to report a degraded status. It must not
   * throw.
   */
  unhandledRejection(reason: unknown) {
    const error = reason instanceof Error ? reason : undefined
    this.log.error(`unhandled promise rejection: ${error ? error.message : String(reason)}`, error?.stack ? { stack: error.stack } : undefined)
  }
}

/**
 * The static side of a plugin class, as the runtime sees it. The declarations are static fields
 * of the subclass rather than of Plugin, so subclasses don't need `override` on them.
 */
export type PluginClass = (new (context: PluginContext) => Plugin) & {
  /** used in error messages */
  readonly name: string
  /** the instance config schema; default: no config (an empty object) */
  readonly config?: z.ZodType
  /** the sensors this plugin offers; ids must be unique among sensors */
  readonly sensors?: readonly SensorClass[]
  /** the actuators this plugin offers; ids must be unique among actuators */
  readonly actuators?: readonly ActuatorClass[]
}
