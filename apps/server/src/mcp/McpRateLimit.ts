import { Disposable, type Clock } from "@lox-nexus/plugin-sdk"
import { JsonRpc } from "./JsonRpc.ts"
import { JsonRpcError } from "./JsonRpcError.ts"

interface Bucket {
  calls: number
  changes: number
  at: number
  running: number
  /** the changing call last in line; the next one waits for it */
  changing: Promise<void>
}

/**
 * Limits per access token, so a looping agent can't flood Nexus: 120 calls a minute, 30 of them
 * changing (token buckets that refill evenly), at most 4 at once, and changing calls one after
 * the other. Beyond that a call is refused with how long to wait.
 */
export class McpRateLimit extends Disposable {
  static readonly CALLS_PER_MINUTE = 120
  static readonly CHANGES_PER_MINUTE = 30
  static readonly CONCURRENT = 4
  private readonly buckets = new Map<string, Bucket>()

  constructor(clock?: Clock) {
    super()
    this.useClock(clock)
    // a token not used for 10 minutes has full buckets anyway
    this.every(60_000, () => this.prune())
  }

  /**
   * Takes a call; resolves with the release once it may run (a changing call waits for the
   * previous one of the token).
   * @throws JsonRpcError when the token is over a limit
   */
  async acquire(tokenId: string, changes: boolean): Promise<() => void> {
    const bucket = this.refill(tokenId)
    if (bucket.calls < 1 || (changes && bucket.changes < 1)) throw McpRateLimit.refused(bucket, changes)
    if (bucket.running >= McpRateLimit.CONCURRENT) throw new JsonRpcError(JsonRpc.RATE_LIMITED, `at most ${McpRateLimit.CONCURRENT} calls at once per token`, { retryAfterS: 1 })
    bucket.calls--
    if (changes) bucket.changes--
    bucket.running++
    let finish = () => {}
    const turn = changes ? bucket.changing : Promise.resolve()
    if (changes) bucket.changing = new Promise<void>(resolve => (finish = resolve))
    await turn
    let released = false
    return () => {
      if (released) return
      released = true
      bucket.running--
      finish()
    }
  }

  private refill(tokenId: string) {
    const now = this.currentClock().now()
    const bucket = this.buckets.get(tokenId) ?? { calls: McpRateLimit.CALLS_PER_MINUTE, changes: McpRateLimit.CHANGES_PER_MINUTE, at: now, running: 0, changing: Promise.resolve() }
    const minutes = (now - bucket.at) / 60_000
    bucket.calls = Math.min(McpRateLimit.CALLS_PER_MINUTE, bucket.calls + minutes * McpRateLimit.CALLS_PER_MINUTE)
    bucket.changes = Math.min(McpRateLimit.CHANGES_PER_MINUTE, bucket.changes + minutes * McpRateLimit.CHANGES_PER_MINUTE)
    bucket.at = now
    this.buckets.set(tokenId, bucket)
    return bucket
  }

  private prune() {
    const now = this.currentClock().now()
    for (const [id, bucket] of this.buckets) if (bucket.running === 0 && now - bucket.at > 10 * 60_000) this.buckets.delete(id)
  }

  private static refused(bucket: Bucket, changes: boolean) {
    const [left, perMinute] = changes && bucket.changes < 1 ? [bucket.changes, McpRateLimit.CHANGES_PER_MINUTE] : [bucket.calls, McpRateLimit.CALLS_PER_MINUTE]
    const retryAfterS = Math.max(1, Math.ceil(((1 - left) / perMinute) * 60))
    return new JsonRpcError(JsonRpc.RATE_LIMITED, `too many ${changes ? "changing " : ""}calls for this token (at most ${perMinute} a minute); try again in ${retryAfterS} s`, { retryAfterS })
  }
}
