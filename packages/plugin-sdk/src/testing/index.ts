// Test helpers for plugins (@lox-nexus/plugin-sdk/testing): run a plugin class without Nexus.
export { PluginTestHost, type TestHostOptions } from "./PluginTestHost.ts"
/** the worker-side runtime, for hosts that fake the worker boundary in their own tests */
export { PluginRuntime as PluginRuntimeForTests } from "../runtime/PluginRuntime.ts"
