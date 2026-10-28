import type { HookHandler } from "./HookHandler.ts"

/** The signals currently listening, by hook name. A hook exists while at least one signal uses it. */
export class HookRegistry {
  private readonly hooks = new Map<string, Set<HookHandler>>()

  /** adds a handler; returns the function that removes it again */
  add(handler: HookHandler): () => void {
    const handlers = this.hooks.get(handler.hook) ?? new Set()
    handlers.add(handler)
    this.hooks.set(handler.hook, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0 && this.hooks.get(handler.hook) === handlers) this.hooks.delete(handler.hook)
    }
  }

  handlers(name: string): HookHandler[] {
    return [...this.hooks.get(name) ?? []]
  }

  has(name: string) {
    return this.hooks.has(name)
  }

  /** hook names in alphabetical order */
  names(): string[] {
    return [...this.hooks.keys()].sort()
  }
}
