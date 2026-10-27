// Entry module: Nexus loads it in a plugin worker (the bundle built from it in production).
import { PluginEntry } from "@lox-nexus/plugin-sdk"
import { HomeAssistantPlugin } from "./HomeAssistantPlugin.ts"

export default PluginEntry.define(HomeAssistantPlugin)
