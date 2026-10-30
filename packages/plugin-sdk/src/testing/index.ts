/**
 * Test helpers for plugins: PluginTestHost runs a plugin class in-process, through the same
 * runtime as in production, without a Nexus server.
 *
 * @packageDocumentation
 * @module @lox-nexus/plugin-sdk/testing
 */
export { PluginTestHost, type TestHostOptions } from "./PluginTestHost.ts"
export { TestClock } from "./TestClock.ts"
export type { ConfigCheckResult, ConfigIssue } from "../runtime/ConfigHost.ts"
/**
 * the worker-side runtime, for hosts that fake the worker boundary in their own tests
 * @internal not part of the plugin API; its constructor may change in any version
 */
export { PluginRuntime as PluginRuntimeForTests } from "../runtime/PluginRuntime.ts"
