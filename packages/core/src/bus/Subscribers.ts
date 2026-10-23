import type { DisposableLike } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "./BusMessage.ts"
import { TopicTrie } from "./TopicTrie.ts"

export type MessageHandler = (message: BusMessage) => void

/**
 * Pattern subscribers and taps. Taps see every recorded message (including shadowed publishes,
 * forces and releases); subscribers see only what is delivered. Handler errors are reported, never thrown.
 */
export class Subscribers {
  private readonly trie = new TopicTrie<MessageHandler>()
  private readonly taps = new Set<MessageHandler>()

  /** @param onError receives handler exceptions; EventBus turns them into system/bus/error events */
  constructor(private readonly onError: (message: BusMessage, error: unknown) => void) {}

  /** @throws RangeError for an invalid pattern. The same handler may be subscribed several times; each handle is independent. */
  subscribe(pattern: string, handler: MessageHandler): DisposableLike {
    const wrapped: MessageHandler = message => handler(message)
    this.trie.add(pattern, wrapped)
    return { dispose: () => this.trie.remove(pattern, wrapped) }
  }

  /** observes every dispatched message regardless of topic */
  tap(handler: MessageHandler): DisposableLike {
    const wrapped: MessageHandler = message => handler(message)
    this.taps.add(wrapped)
    return { dispose: () => void this.taps.delete(wrapped) }
  }

  /** records the message on all taps, and delivers it to matching subscribers unless tapOnly */
  dispatch(message: BusMessage, tapOnly = false) {
    for (const tap of this.taps) this.call(tap, message)
    if (tapOnly) return
    for (const handler of this.trie.match(message.topic)) this.call(handler, message)
  }

  private call(handler: MessageHandler, message: BusMessage) {
    try {
      handler(message)
    } catch (error) {
      this.onError(message, error)
    }
  }
}
