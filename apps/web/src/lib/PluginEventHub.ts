import type { StreamEvent } from "@lox-nexus/api"
import type { InjectionKey } from "vue"

/** what running plugins tell open pages over the stream */
export type PluginStreamEvent = Extract<StreamEvent, { type: "plugin-panel" | "plugin-action-progress" }>
type Listener = (event: PluginStreamEvent) => void

/**
 * Hands the stream's plugin events to the parts of a page that wait for them (the panel, a running
 * action's dialog), also to those that subscribe before the stream is open.
 */
export class PluginEventHub {
  /** how components below a plugin page find its hub */
  static readonly KEY: InjectionKey<PluginEventHub> = Symbol("plugin events")
  private readonly listeners = new Set<Listener>()

  emit(event: PluginStreamEvent) {
    for (const listener of [...this.listeners]) listener(event)
  }

  /** @returns the unsubscribe */
  on(listener: Listener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
