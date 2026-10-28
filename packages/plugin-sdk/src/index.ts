/**
 * The public SDK for plugins: the base classes (Plugin, Sensor, Actuator), lifetimes
 * (Disposable), the worker entry (PluginEntry) and config helpers (secret, code, z).
 *
 * Values, the host/worker protocol and the test helpers live in the subpaths
 * `@lox-nexus/plugin-sdk/values`, `/wire` and `/testing`.
 *
 * @packageDocumentation
 * @module @lox-nexus/plugin-sdk
 */
export { Disposable } from "./lifecycle/Disposable.ts"
export type { DisposableLike, Listenable, Listener, Teardown } from "./lifecycle/Disposable.ts"
export { Plugin, type PluginClass } from "./plugin/Plugin.ts"
export { Sensor, type SensorClass, type SensorOutput } from "./plugin/Sensor.ts"
export { Actuator, type ActuatorClass, type ActuatorConcurrency } from "./plugin/Actuator.ts"
export type { SignalInfo } from "./plugin/SignalInfo.ts"
export type { HttpHandler, PluginContext, PluginHttp, PluginLogger, PluginStatus, PluginStore } from "./plugin/PluginContext.ts"
export { secret } from "./plugin/Secret.ts"
export { code, type CodeLanguage } from "./plugin/Code.ts"
export { PluginEntry } from "./runtime/PluginEntry.ts"
export { SupersededError } from "./runtime/ActuatorRunner.ts"
export type { CatalogEntry, CatalogNode, HttpResponse, Panel } from "./wire/Shapes.ts"
export type { HttpRequest } from "./wire/HostMessages.ts"
/** the zod the SDK is built with; plugins use it so schemas and the runtime agree on one version */
export { z } from "zod"
