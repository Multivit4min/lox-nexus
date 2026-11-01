/**
 * The public SDK for plugins: the base classes (Plugin, Sensor, Actuator, Action), lifetimes
 * (Disposable), the worker entry (PluginEntry) and config helpers (secret, code, token, signalName,
 * signalGroup, z).
 *
 * Values, the host/worker protocol and the test helpers live in the subpaths
 * `@lox-nexus/plugin-sdk/values`, `/wire` and `/testing`.
 *
 * @categoryDescription Plugin
 * The class you extend ({@link Plugin}), the one line that exports it ({@link PluginEntry}), and
 * what the runtime hands it: its config, log, store and status (see {@link PluginContext}).
 *
 * @categoryDescription Sensors and actuators
 * The signals a plugin offers. Extend {@link Sensor} for a value that comes from the device and
 * {@link Actuator} for a command that goes to it; list them in the plugin's static `sensors` and
 * `actuators`.
 *
 * @categoryDescription Settings form
 * Helpers that mark config and params fields so the UI shows the right input: {@link secret},
 * {@link code}, {@link token}, {@link duration}, {@link slider} and more. {@link Mdns} finds
 * devices on the network for a field marked with {@link discoverable}.
 *
 * @categoryDescription Catalog, panel and actions
 * What the plugin shows in the UI beyond the form: a catalog of ready-to-add signals, a status
 * panel, and buttons a user can press. Extend {@link Action} for something the user starts from
 * the instance page.
 *
 * @categoryDescription Webhooks
 * HTTP routes the plugin registers with `this.http`, reachable at `/hook/<slug>/...`.
 *
 * @categoryDescription Lifetimes and time
 * Everything with a lifetime extends {@link Disposable}: timers, listeners and children
 * registered through it are cleaned up for you. {@link Clock} is the time it runs on, so tests can
 * move time by hand.
 *
 * @categoryDescription Watching signals
 * For plugins that receive the values of signals the user chooses (exporters), declared with the
 * static `watches`.
 *
 * @packageDocumentation
 * @module @lox-nexus/plugin-sdk
 */
export { Disposable } from "./lifecycle/Disposable.ts"
export type { DisposableLike, Listenable, Listener, Teardown } from "./lifecycle/Disposable.ts"
export { SystemClock, type Clock } from "./lifecycle/Clock.ts"
export { Plugin, type PluginClass } from "./plugin/Plugin.ts"
export { Sensor, type SensorClass, type SensorOutput } from "./plugin/Sensor.ts"
export { Actuator, type ActuatorClass, type ActuatorCommand, type ActuatorConcurrency } from "./plugin/Actuator.ts"
export { Action, type ActionClass, type ActionResult } from "./plugin/Action.ts"
export type { ConfigMigration } from "./plugin/ConfigMigration.ts"
export type { SignalInfo } from "./plugin/SignalInfo.ts"
export type { HttpHandler, PluginContext, PluginHttp, PluginLogger, PluginLogLevel, PluginStatus, PluginStore, WatchView } from "./plugin/PluginContext.ts"
export { secret } from "./plugin/Secret.ts"
export { code, type CodeLanguage } from "./plugin/Code.ts"
export { token } from "./plugin/Token.ts"
export { color, discoverable, duration, file, slider, timeOfDay } from "./plugin/FieldKinds.ts"
export { signalName } from "./plugin/SignalName.ts"
export { signalGroup } from "./plugin/SignalGroup.ts"
export { PluginEntry } from "./runtime/PluginEntry.ts"
export { Mdns, type MdnsOptions, type MdnsService } from "./net/Mdns.ts"
export { SupersededError } from "./runtime/ActuatorRunner.ts"
export type { CatalogEntry, CatalogNode, Discovered, HttpResponse } from "./wire/Shapes.ts"
export type { Cell, Panel, PanelPart, RowAction, Tone } from "./wire/PanelShapes.ts"
export type { HttpRequest } from "./wire/HostMessages.ts"
export type { WatchDeclaration, WatchedSignal, WatchedValue } from "./wire/WatchShapes.ts"
/** the zod the SDK is built with; plugins use it so schemas and the runtime agree on one version */
export { z } from "zod"
