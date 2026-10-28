import { AsyncLocalStorage } from "node:async_hooks"
import { Disposable } from "@lox-nexus/plugin-sdk"

/**
 * Per key: the first call runs at once and opens a window of `ms`; calls within the window replace
 * each other, and the last one runs when the window ends (and opens the next). So at most one run
 * per window, and the latest value always arrives.
 *
 * A trailing run happens in the async context of the call it comes from, not of the call that
 * opened the window, so what it emits carries its own command's cause.
 */
export class Throttle extends Disposable {
  private readonly windows = new Map<string, { pending?: () => void }>()

  constructor(private readonly ms: number) {
    super()
  }

  run(key: string, fn: () => void) {
    const window = this.windows.get(key)
    if (window) {
      window.pending = AsyncLocalStorage.bind(fn)
      return
    }
    fn()
    this.open(key)
  }

  private open(key: string) {
    const window: { pending?: () => void } = {}
    this.windows.set(key, window)
    this.after(this.ms, () => {
      this.windows.delete(key)
      if (window.pending) this.run(key, window.pending)
    })
  }
}
