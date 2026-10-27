/**
 * The host/worker protocol: the messages between Nexus and a plugin worker, validated with zod
 * on both sides, and the shapes they carry (catalog, panel, HTTP request and response). Most
 * plugins only need the types; the messages are for tools and hosts.
 *
 * @packageDocumentation
 * @module @lox-nexus/plugin-sdk/wire
 */
export { HostMessageSchema, HttpRequestSchema, SignalSpecSchema, WIRE_VERSION, type HostMessage, type HttpRequest, type SignalSpec } from "./HostMessages.ts"
export { LogLevelSchema, PluginHealthSchema, WorkerMessageSchema, type LogLevel, type PluginHealth, type WorkerMessage } from "./WorkerMessages.ts"
export {
  CapabilityDescriptionSchema, CatalogEntrySchema, CatalogNodeSchema, HttpResponseSchema, PanelSchema, PluginDescriptionSchema,
  type CapabilityDescription, type CatalogEntry, type CatalogNode, type HttpResponse, type JsonSchema, type Panel, type PluginDescription
} from "./Shapes.ts"
export type { PluginWorkerData } from "../runtime/PluginEntry.ts"
