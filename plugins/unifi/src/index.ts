// Entry module: Nexus loads it in a plugin worker (the bundle built from it in production).
import { PluginEntry } from "@lox-nexus/plugin-sdk"
import { UnifiPlugin } from "./UnifiPlugin.ts"

export default PluginEntry.define(UnifiPlugin)
