import type { Discovered } from "@lox-nexus/plugin-sdk/wire"
import type { InjectionKey } from "vue"

/**
 * How a form's fields marked discoverable find values on the network: the settings form of a
 * plugin provides it (asking the plugin with what is filled in so far); elsewhere there is none.
 */
export interface DiscoverContext {
  find(field: string): Promise<Discovered>
}

export const DISCOVER: InjectionKey<DiscoverContext> = Symbol("discover")
