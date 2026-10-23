import { randomUUID } from "node:crypto"
import type { WireDto } from "@lox-nexus/api"
import { WireSchema, type WireConfig, type WireEngine, type WireInput } from "@lox-nexus/core"
import type { Logger } from "pino"
import type { WireRepository } from "../db/repositories/WireRepository.ts"
import { HttpError } from "../http/HttpError.ts"

/** Request body of POST/PUT /api/wires: a wire without its id (the server assigns it). */
export const WireBodySchema = WireSchema.omit({ id: true })

/**
 * Wires: stored in the database, running in WireEngine. A stored wire that can't start (an
 * invalid transform written by hand, say) stays stored and is listed as inactive.
 * Deleting a signal deletes its wires in both places: the database through foreign keys,
 * the engine through SignalRegistry's "unregistered" event.
 */
export class WireService {
  constructor(private readonly repo: WireRepository, private readonly engine: WireEngine, private readonly log: Logger) {}

  /** starts every stored wire; call after all signals are registered */
  load() {
    for (const wire of this.repo.list()) {
      try {
        this.engine.add(wire)
      } catch (error) {
        this.log.warn({ err: error, wire: wire.id }, "stored wire can't be started")
      }
    }
  }

  /** every stored wire; `active` tells whether WireEngine is running it */
  list(): WireDto[] {
    const active = new Set(this.engine.list().map(wire => wire.id))
    return this.repo.list().map(wire => WireService.toDto(wire, active.has(wire.id ?? "")))
  }

  /**
   * Starts the wire, then stores it; the start is undone if storing fails.
   * @throws ZodError 400, HttpError 409 for unknown signals or a target that already has a wire
   */
  create(input: unknown): WireDto {
    const config = WireService.start(this.engine, { ...WireBodySchema.parse(input), id: randomUUID() })
    try {
      this.repo.save(config)
    } catch (error) {
      this.engine.remove(config.id)
      throw error
    }
    return WireService.toDto(config, true)
  }

  /**
   * Replaces the running wire. If the new config is refused, or storing it fails (e.g. the target
   * belongs to a stored but inactive wire), the old wire keeps running and nothing changes.
   * @throws HttpError 404 unknown wire, 409 refused by the engine, ZodError 400
   */
  update(id: string, input: unknown): WireDto {
    const previous = this.repo.get(id)
    if (!previous) throw HttpError.notFound(`wire "${id}"`)
    const body = WireBodySchema.parse(input)
    const wasActive = this.engine.remove(id)
    const restore = () => {
      if (wasActive) this.engine.add(previous)
    }
    let config: WireConfig
    try {
      config = WireService.start(this.engine, { ...body, id })
    } catch (error) {
      restore()
      throw error
    }
    try {
      this.repo.save(config)
    } catch (error) {
      this.engine.remove(id)
      restore()
      throw error
    }
    return WireService.toDto(config, true)
  }

  /** stops and deletes the wire; @throws HttpError 404 */
  delete(id: string) {
    if (!this.repo.get(id)) throw HttpError.notFound(`wire "${id}"`)
    this.repo.delete(id)
    this.engine.remove(id)
  }

  // unknown signals or a target that already has a wire are the user's mistake: 409, not 500
  private static start(engine: WireEngine, input: WireInput): WireConfig {
    try {
      return engine.add(input)
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }

  private static toDto(wire: WireInput, active: boolean): WireDto {
    return {
      id: wire.id, label: wire.label, sourceId: wire.sourceId, targetId: wire.targetId,
      transforms: (wire.transforms ?? []) as WireDto["transforms"], enabled: wire.enabled ?? true, syncOnStart: wire.syncOnStart ?? false, active
    }
  }
}
