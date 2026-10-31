import type { StreamEvent } from "@lox-nexus/api"

/** What running plugins tell open pages: a changed panel, an action's progress. */
export type PluginEvent = Extract<StreamEvent, { type: "plugin-panel" | "plugin-action-progress" }>

/**
 * Hands what running plugins report for open pages to the stream's clients. Few and small (at most
 * one panel push per instance and second, four progress lines per running action), so every
 * client gets every event and picks what concerns the page it shows.
 */
export class PluginEvents {
  private readonly listeners = new Set<(event: PluginEvent) => void>()

  emit(event: PluginEvent) {
    for (const listener of [...this.listeners]) listener(event)
  }

  /** @returns the unsubscribe */
  on(listener: (event: PluginEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
