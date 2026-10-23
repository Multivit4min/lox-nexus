import { randomUUID } from "node:crypto"
import type { MiniserverDto, MiniserverInput } from "@lox-nexus/api"
import { MiniserverConfigSchema, type Miniserver, type MiniserverManager } from "@lox-nexus/loxone"
import type { Logger } from "pino"
import type { MiniserverRepository } from "../db/repositories/MiniserverRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { MiniserverMapper } from "./MiniserverMapper.ts"
import type { LoxoneSignalService } from "./LoxoneSignalService.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"

/**
 * Miniserver configs: the database is the source of truth, MiniserverManager the running
 * projection. Every change is validated by the Loxone schema first, then stored, then applied.
 * A failed start is not an error of the request: it shows up as `lastError` in the DTO.
 */
export class MiniserverService {
  constructor(
    private readonly repo: MiniserverRepository,
    private readonly manager: MiniserverManager,
    private readonly signals: LoxoneSignalService,
    private readonly cleanup: TopicCleanup,
    private readonly log: Logger
  ) {}

  /** builds the runtime from the database at boot; a broken row is logged and skipped, never fatal */
  load() {
    for (const config of this.repo.list()) {
      try {
        this.manager.add(config)
        this.signals.load(config.id)
      } catch (error) {
        this.log.error({ err: error, miniserver: config.id }, "skipping miniserver that can't be loaded")
      }
    }
  }

  /** all Miniservers with their live state */
  list(): MiniserverDto[] {
    return this.manager.list().map(MiniserverMapper.toDto)
  }

  /** @throws HttpError 404 */
  get(id: string): MiniserverDto {
    return MiniserverMapper.toDto(this.require(id))
  }

  /**
   * @throws ZodError 400 for an invalid config, HttpError 409 for a taken slug
   */
  async create(input: MiniserverInput): Promise<MiniserverDto> {
    const config = MiniserverConfigSchema.parse(MiniserverService.toConfig(randomUUID(), input, undefined))
    const miniserver = this.wrap(() => this.manager.add(config))
    try {
      this.repo.save(config)
    } catch (error) {
      await this.manager.remove(config.id)
      throw error
    }
    if (config.enabled) await this.tryStart(miniserver)
    return MiniserverMapper.toDto(miniserver)
  }

  /**
   * Stores and applies the new config; it restarts if it was running and follows `enabled`.
   * @throws HttpError 404, ZodError 400
   */
  async update(id: string, input: MiniserverInput): Promise<MiniserverDto> {
    const miniserver = this.require(id)
    const previous = miniserver.config
    const config = MiniserverConfigSchema.parse(MiniserverService.toConfig(id, input, previous.password))
    this.repo.save(config)
    try {
      await this.manager.update(id, config)
    } catch (error) {
      // a refused config (rule violation) is undone; a restart that fails (port taken) is not an
      // error of the request, it shows up as lastError
      if (miniserver.config === previous) {
        this.repo.save(previous)
        throw HttpError.fromDomain(error)
      }
      this.failed(miniserver, error)
    }
    if (config.enabled && !miniserver.isRunning) await this.tryStart(miniserver)
    if (!config.enabled && miniserver.isRunning) await miniserver.stop()
    return MiniserverMapper.toDto(miniserver)
  }

  /** Deletes the Miniserver, its signals and their wires, and everything left on its topics. `by` is recorded on released forces. */
  async remove(id: string, by: string) {
    const { slug } = this.require(id).config
    this.repo.delete(id)
    await this.manager.remove(id)
    this.cleanup.forget(`loxone/${slug}/#`, by)
    this.cleanup.forget(`system/loxone/${slug}/#`, by)
  }

  /** runtime only; `enabled` decides what happens at the next boot */
  async start(id: string) {
    const miniserver = this.require(id)
    await this.tryStart(miniserver)
    return MiniserverMapper.toDto(miniserver)
  }

  /** runtime only, like start() */
  async stop(id: string) {
    const miniserver = this.require(id)
    await miniserver.stop()
    return MiniserverMapper.toDto(miniserver)
  }

  /** the running Miniserver, for callers that need the object rather than a DTO
   * @throws HttpError 404 */
  require(id: string): Miniserver {
    const miniserver = this.manager.get(id)
    if (!miniserver) throw HttpError.notFound(`miniserver "${id}"`)
    return miniserver
  }

  private async tryStart(miniserver: Miniserver) {
    await miniserver.start().catch((error: unknown) => this.failed(miniserver, error))
  }

  private failed(miniserver: Miniserver, error: unknown) {
    this.log.warn({ err: error, miniserver: miniserver.config.id }, "miniserver failed to start")
  }

  // domain errors (taken slug) become 409s; zod errors stay 400s
  private wrap<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }

  /** `password` undefined keeps the stored one, null removes it */
  private static toConfig(id: string, input: MiniserverInput, storedPassword: string | undefined): object {
    const { password, ...rest } = input
    const next = password === undefined ? storedPassword : password ?? undefined
    return { ...rest, id, ...(next === undefined ? {} : { password: next }) }
  }
}
