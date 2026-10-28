import type { FastifyReply, FastifyRequest } from "fastify"
import { HttpError } from "./HttpError.ts"

/**
 * Holds off other changes while a long change runs that replaces everything (a config import).
 * The work runs under hold(); meanwhile check(), an onRequest hook on the API, answers every
 * changing request with 503, so nothing made through the API can get lost in it or make it roll
 * back. Reads go on. The request that took the lock is past its hooks already.
 */
export class ChangeLock {
  /** seconds a refused client is told to wait */
  static readonly RETRY_AFTER = 5
  private holder: string | undefined

  /** what holds the lock, e.g. "a config import"; undefined when free */
  get heldBy() {
    return this.holder
  }

  /**
   * Runs `work` with the lock held.
   * @param what what is running, for the refusal messages
   * @throws HttpError 409 while the lock is held already
   */
  async hold<T>(what: string, work: () => Promise<T>): Promise<T> {
    if (this.holder) throw HttpError.conflict(`${this.holder} is running`)
    this.holder = what
    try {
      return await work()
    } finally {
      this.holder = undefined
    }
  }

  readonly check = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!this.holder || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return
    return reply.code(503).header("retry-after", String(ChangeLock.RETRY_AFTER)).send({ error: `${this.holder} is running; try again when it is done` })
  }
}
