import type { z } from "zod"
import { SystemClock, type Clock } from "../lifecycle/Clock.ts"
import { Disposable } from "../lifecycle/Disposable.ts"
import type { CatalogNode, Panel } from "../wire/Shapes.ts"
import type { WatchDeclaration, WatchedValue } from "../wire/WatchShapes.ts"
import type { ActuatorClass } from "./Actuator.ts"
import type { PluginContext, WatchView } from "./PluginContext.ts"
import type { SensorClass } from "./Sensor.ts"

/**
 * Base class of a plugin. One instance runs per configured plugin instance, in its own worker
 * thread, so a plugin that crashes or hangs affects nothing else. Extend it, declare the static
 * fields below, and export the class with PluginEntry.define().
 *
 * Subclasses declare what they offer as static fields (see PluginClass; all optional) and do
 * their work in start(); everything registered with own(), every(), after() or listen() is
 * cleaned up when the instance stops.
 *
 * The order of events for one run: the constructor (field initializers can already use
 * `this.config`), then start(), then the sensors and actuators the user configured (each gets its
 * own start()), then requests such as catalog(), panel() and webhooks for as long as it runs.
 * When the instance stops, its signals are disposed and then the plugin. A crash or a restart
 * creates a new object; nothing in memory survives, only the store does.
 *
 * Plugin code can throw into the host only through start() and the request methods; everything
 * else is logged or, for a promise nobody handles, given to unhandledRejection().
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
    this.useClock(context.clock)
  }

  /**
   * The instance config, already validated against the static `config` schema (defaults applied).
   * It never changes during one run: when the user saves new settings, the instance restarts and
   * a new plugin object is built with them.
   */
  get config(): Config {
    return this.context.config as Config
  }

  /**
   * The time to use instead of `Date.now()`: `this.clock.now()`. every() and after() run on it too.
   * The system clock in production; a TestClock when a test gives one.
   */
  get clock(): Clock {
    return this.context.clock ?? SystemClock.instance
  }

  /**
   * The IANA time zone of the installation, e.g. "Europe/Vienna", for anything that depends on the
   * local time (opening hours, "today"). Nexus takes it from the Loxone project; without one it is
   * the server's zone, which in a container is often UTC; so is a zone this runtime doesn't know.
   * Fixed for one run of the instance.
   */
  get timeZone(): string {
    const given = this.context.timeZone
    if (given) {
      try {
        return new Intl.DateTimeFormat("en-US", { timeZone: given }).resolvedOptions().timeZone
      } catch {
        // an unknown zone from the host must not fail the plugin's start; the server's zone is the fallback
      }
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  /**
   * Writes to the server log, tagged with this instance, and to the instance's page (its last
   * lines). Inside an actuator's run() a line is also linked to the command that caused it. Never
   * log secrets.
   */
  get log() {
    return this.context.log
  }

  /**
   * Small persisted state of this instance, for what must survive a restart (a token, a cursor,
   * the id last seen). Reads are synchronous; writes are saved by the host in the background.
   */
  get store() {
    return this.context.store
  }

  /**
   * Reports the plugin's own health to the UI: "degraded" with a message while something is
   * wrong but the plugin keeps trying, "running" when it is fine again. A new run starts as
   * "running".
   */
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

  /**
   * Registers webhook routes under `/hook/<slug>/…`. Register them in start(); routes are
   * unauthenticated, so the handler must check a secret itself (see PluginHttp).
   */
  get http() {
    return this.context.http
  }

  /**
   * The signals the user chose for this instance, for plugins that declare `watches`. Empty for
   * other plugins and until the host has sent the list (it arrives after start() resolved, and
   * again whenever the choice changes). Read it inside watched() and watchChanged(), not in
   * start().
   */
  get watch(): WatchView {
    return this.context.watch ?? Plugin.NO_WATCH
  }

  private static readonly NO_WATCH: WatchView = { signals: () => [], signal: () => undefined }

  /**
   * Starts the work. Called once per run, after the constructor and before the first signal is
   * added; the host waits for it to resolve (at most 30 seconds, then it terminates the worker and
   * restarts it like after a crash). Reject only for problems a restart can't fix (invalid
   * credentials, a missing device): the instance goes into the error state, what start()
   * registered is disposed, and it is not restarted. For a device that is merely unreachable,
   * resolve and report `status.set("degraded", ...)` while retrying. Slow first requests belong in
   * the background (`void this.poll()`), not in an awaited start().
   */
  start(): void | Promise<void> {}

  /**
   * Optional tree of ready-to-add sensors and actuators, e.g. built from the device's data. Asked
   * on demand by the UI, so it may query the device; a throw is shown to the user as the error.
   * It must answer within 30 seconds and with at most 16 MiB of JSON, or the request fails. Can
   * be called at any time while the plugin runs, also several times at once.
   */
  catalog(): CatalogNode[] | Promise<CatalogNode[]> {
    return []
  }

  /**
   * Optional status view for the plugin's page, asked on demand (when the page is opened and when
   * the user presses Refresh, so keep it cheap and read from memory); undefined shows nothing. A
   * throw or an invalid panel fails the request; the same 30 seconds and 16 MiB limits as
   * catalog() apply. Only asked while the instance runs.
   */
  panel(): Panel | undefined | Promise<Panel | undefined> {
    return undefined
  }

  /**
   * Values of the watched signals (plugins that declare `watches`), oldest first, in batches of up
   * to a thousand. The next batch comes once this returns (or its promise settles), so a slow
   * export slows delivery instead of piling up; meanwhile the host keeps a bounded queue and
   * `dropped` says how many values it had to leave out since the last batch. A throw is logged
   * and the feed goes on. Calls never overlap, and a running call finishes before the plugin is
   * disposed on stop. Declare `static watches` too, or the plugin is never given any values.
   */
  watched?(values: readonly WatchedValue[], dropped: number): void | Promise<void>

  /**
   * The watched signals changed: chosen or left out, renamed. `this.watch` has the new list.
   * Called once after start() with the first list, then on every change; always before the
   * values that belong to the new list. Optional to override.
   */
  watchChanged(): void {}

  /**
   * A promise in this worker was rejected and nobody handled it (a forgotten `.catch`). The worker
   * keeps running; by default the reason is logged as an error with its stack. Override it to say
   * more, e.g. which line of user code it came from, or to report a degraded status. It must not
   * throw: if it does, the original reason is logged instead. Not called before the plugin is
   * created or after it is disposed; the runtime logs those.
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
  /**
   * set when the plugin receives values of signals the user chooses (an exporter): Plugin.watched()
   * gets them. The label and description are shown where the user chooses them.
   */
  readonly watches?: WatchDeclaration
}
