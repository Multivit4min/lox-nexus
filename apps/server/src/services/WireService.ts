import { randomUUID } from "node:crypto"
import { WirePreviewRequestSchema, type TransformDto, type WireDto, type WirePreviewDto } from "@lox-nexus/api"
import {
  TransformSchema, WirePreview, WireSchema, type SignalRegistry, type TransformConfig, type WireConfig, type WireEngine, type WireInput
} from "@lox-nexus/core"
import type { Logger } from "pino"
import type { WireRepository } from "../db/repositories/WireRepository.ts"
import { HttpError } from "../http/HttpError.ts"

/** Request body of POST/PUT /api/wires: a wire without its id (the server assigns it). */
export const WireBodySchema = WireSchema.omit({ id: true })

/** the preview checks its transforms like a wire's, so issues have the same paths (transforms.1.from) */
const PreviewSchema = WirePreviewRequestSchema.extend({ transforms: WireSchema.shape.transforms })

/** a stored wire the engine would accept now but doesn't run; the server can't tell why */
const STOPPED = "not running; save it to start it again"

/**
 * Wires: stored in the database, running in WireEngine. A stored wire that can't start (an
 * invalid transform written by hand, say) stays stored and is listed as inactive.
 * Deleting a signal deletes its wires in both places: the database through foreign keys,
 * the engine through SignalRegistry's "unregistered" event.
 */
export class WireService {
  private readonly previewer = new WirePreview()

  constructor(
    private readonly repo: WireRepository,
    private readonly engine: Pick<WireEngine, "add" | "list" | "problem" | "remove" | "sync">,
    private readonly signals: Pick<SignalRegistry, "get">,
    private readonly log: Logger
  ) {}

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

  /** every stored wire; `active` tells whether WireEngine is running it, `problem` why not */
  list(): WireDto[] {
    const active = new Set(this.engine.list().map(wire => wire.id))
    return this.repo.list().map(wire => {
      if (active.has(wire.id ?? "")) return WireService.toDto(wire, true)
      return { ...WireService.toDto(wire, false), problem: this.engine.problem(wire) ?? STOPPED }
    })
  }

  /**
   * What the transforms make of a value, and what a target gets after the conversion to its type;
   * nothing is started. Invalid transforms are a 400 with the path of the faulty field.
   * @throws ZodError 400; HttpError 404 for an unknown target
   */
  preview(input: unknown): WirePreviewDto {
    const request = PreviewSchema.parse(input)
    const target = request.targetId === undefined ? undefined : this.signals.get(request.targetId)
    if (request.targetId !== undefined && !target) throw HttpError.notFound(`signal "${request.targetId}"`)
    return this.previewer.run(request.value, request.transforms, target?.valueType ?? "any")
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

  /**
   * For an import: stores the wire with its own id and starts it if the engine accepts it. One it
   * refuses (a target type that no longer fits, a transform from a newer version) is stored anyway
   * and listed as inactive, as it was when exported.
   * @returns whether it runs
   * @throws SQLite constraint error (409) for unknown signals or a target that already has a wire
   */
  restore(wire: Required<WireInput>): boolean {
    let active = true
    try {
      this.engine.add(wire)
    } catch (error) {
      active = false
      this.log.warn({ err: error, wire: wire.id }, "imported wire can't be started")
    }
    try {
      this.repo.save(wire)
    } catch (error) {
      if (active) this.engine.remove(wire.id)
      throw error
    }
    return active
  }

  /** sends the source's current value through a running wire once (see WireEngine.sync) */
  sync(id: string) {
    this.engine.sync(id)
  }

  /** stops and deletes the wire; @throws HttpError 404 */
  delete(id: string) {
    if (!this.repo.get(id)) throw HttpError.notFound(`wire "${id}"`)
    this.repo.delete(id)
    this.engine.remove(id)
  }

  // unknown signals or a target that already has a wire are the user's mistake: 409, not 500
  private static start(engine: Pick<WireEngine, "add">, input: WireInput): WireConfig {
    try {
      return engine.add(input)
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }

  private static toDto(wire: WireInput, active: boolean): WireDto {
    return {
      id: wire.id, label: wire.label, sourceId: wire.sourceId, targetId: wire.targetId,
      transforms: WireService.transformsOf(wire.transforms ?? []), enabled: wire.enabled ?? true, syncOnStart: wire.syncOnStart ?? false, active
    }
  }

  // stored steps aren't validated (a hand-written row, an import from a newer version), so the
  // UI gets only steps it can read, and the rest as "unsupported" with what was stored
  private static transformsOf(stored: unknown): TransformDto[] {
    if (!Array.isArray(stored)) return [{ op: "unsupported", raw: stored }]
    return stored.map((step: unknown) => {
      const parsed = TransformSchema.safeParse(step)
      return parsed.success ? WireService.mirror(parsed.data) : { op: "unsupported", raw: step }
    })
  }

  // fails to compile when TransformDto stops covering what TransformSchema accepts
  private static mirror(step: TransformConfig): TransformDto {
    return step
  }
}
