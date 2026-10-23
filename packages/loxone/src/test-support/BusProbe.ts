import type { BusMessage, EventBus } from "@lox-nexus/core"

/** Waits for bus messages in tests, with a timeout so a missing message fails instead of hanging the suite. */
export class BusProbe {
  static next(bus: EventBus, pattern: string, predicate: (m: BusMessage) => boolean = () => true, timeoutMs = 2000) {
    return new Promise<BusMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.dispose()
        reject(new Error(`no message on ${pattern} within ${timeoutMs} ms`))
      }, timeoutMs)
      const subscription = bus.subscribe(pattern, message => {
        if (!predicate(message)) return
        clearTimeout(timer)
        subscription.dispose()
        resolve(message)
      })
    })
  }

  /** a predicate for string states such as the Miniserver status */
  static isString(text: string) {
    return (message: BusMessage) => message.value?.type === "string" && message.value.value === text
  }
}
