import type { FastifyReply, FastifyRequest } from "fastify"
import { HttpError } from "./HttpError.ts"

/**
 * Holds off other changes while a long change runs that replaces everything (a config import).
 * check(), an onRequest hook on the API, counts the changing requests in flight (every method but
 * GET, HEAD and OPTIONS, unless the route is marked `lockFree`). hold() waits until none is in
 * flight, then runs its work; meanwhile check() answers new changing requests with 503, so nothing
 * made through the API can get lost in it or make it roll back. Reads go on.
 */
export class ChangeLock {
  /** seconds a refused client is told to wait */
  static readonly RETRY_AFTER = 5
  /** how long hold() waits for changing requests in flight before it gives up */
  static readonly DRAIN_MS = 10_000
  private holder: string | undefined
  private inFlight = 0
  private drained: Array<() => void> = []

  /** what holds the lock, e.g. "a config import"; undefined when free */
  get heldBy() {
    return this.holder
  }

  /**
   * Runs `work` with the lock held, once the changing requests in flight are done.
   * @param what what is running, for the refusal messages
   * @throws HttpError 409 while the lock is held already, or when other changes don't finish in time
   */
  async hold<T>(what: string, work: () => Promise<T>): Promise<T> {
    if (this.holder) throw HttpError.conflict(`${this.holder} is running`)
    this.holder = what
    try {
      await this.drain()
      return await work()
    } finally {
      this.holder = undefined
    }
  }

  /**
   * Counts a change in flight that isn't a request of its own, e.g. a changing MCP tool inside
   * the lock-free /mcp route, so hold() waits for it. Call the returned function when it is done
   * (more than once is harmless).
   * @throws HttpError 503 while the lock is held
   */
  enter(): () => void {
    if (this.holder) throw new HttpError(503, `${this.holder} is running; try again when it is done`)
    this.inFlight++
    let counted = true
    return () => {
      if (!counted) return
      counted = false
      this.done()
    }
  }

  readonly check = async (request: FastifyRequest, reply: FastifyReply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || request.routeOptions.config.lockFree) return
    let release: () => void
    try {
      release = this.enter()
    } catch {
      return reply.code(503).header("retry-after", String(ChangeLock.RETRY_AFTER)).send({ error: `${this.holder} is running; try again when it is done` })
    }
    // "finish" when the answer went out, "close" when the client went away first; counted once
    reply.raw.once("finish", release)
    reply.raw.once("close", release)
  }

  private done() {
    this.inFlight--
    if (this.inFlight > 0) return
    for (const resolve of this.drained.splice(0)) resolve()
  }

  // new changing requests are refused already; this waits for those that got in before
  private async drain() {
    if (this.inFlight === 0) return
    let timer: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        new Promise<void>(resolve => this.drained.push(resolve)),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(HttpError.conflict("other changes are still running; try again in a moment")), ChangeLock.DRAIN_MS)
        })
      ])
    } finally {
      clearTimeout(timer)
    }
  }
}
