import { randomUUID } from "node:crypto"
import { PluginNotRunningError, type PluginInstanceConfig, type PluginManager } from "@lox-nexus/core"
import type { PluginInstanceDto, PluginInstanceInput, PluginPackageDto } from "@lox-nexus/api"
import { PluginInstanceInputSchema } from "@lox-nexus/api"
import type { Logger } from "pino"
import type { PluginInstanceRepository } from "../db/repositories/PluginInstanceRepository.ts"
import type { PluginSignalRepository } from "../db/repositories/PluginSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { SecretFields } from "../plugins/SecretFields.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"

/**
 * Plugin instances: the database is the source of truth, PluginManager the running projection.
 * An instance whose plugin isn't available (any more) stays stored and is listed as
 * "unavailable". Starting is not an error of a request: a plugin that refuses to start shows up
 * as state "error" with `lastError`.
 */
export class PluginService {
  constructor(
    private readonly repo: PluginInstanceRepository,
    private readonly signalRepo: PluginSignalRepository,
    private readonly manager: PluginManager,
    private readonly available: PluginCatalog,
    private readonly cleanup: TopicCleanup,
    private readonly log: Logger
  ) {}

  /** builds the runtime from the database at boot; a broken signal row is logged and skipped */
  load() {
    for (const instance of this.repo.list()) {
      const entry = this.available.get(instance.plugin)
      if (!entry) {
        this.log.warn({ instance: instance.id, plugin: instance.plugin }, "plugin instance can't run: its plugin is not available")
        continue
      }
      const supervisor = this.manager.add(instance, entry.pkg)
      for (const signal of this.signalRepo.listFor(instance.id)) {
        try {
          supervisor.signals.add(signal)
        } catch (error) {
          this.log.error({ err: error, signal: signal.id }, "skipping plugin signal that can't be loaded")
        }
      }
    }
  }

  packages(): PluginPackageDto[] {
    return this.available.list().map(({ pkg, version, icon, source }) => ({ id: pkg.id, name: pkg.name, version, source, description: pkg.description, ...(icon ? { icon } : {}) }))
  }

  list(): PluginInstanceDto[] {
    return this.repo.list().map(instance => this.toDto(instance))
  }

  /** @throws HttpError 404 */
  get(id: string): PluginInstanceDto {
    return this.toDto(this.stored(id))
  }

  /** @throws HttpError 400 for an unknown plugin, 409 for a taken slug */
  async create(input: PluginInstanceInput): Promise<PluginInstanceDto> {
    const parsed = PluginInstanceInputSchema.parse(input)
    const entry = this.available.get(parsed.plugin)
    if (!entry) throw HttpError.badRequest(`plugin "${parsed.plugin}" is not available`)
    const instance: PluginInstanceConfig = { id: randomUUID(), ...parsed }
    const supervisor = PluginService.domain(() => this.manager.add(instance, entry.pkg))
    try {
      this.repo.save(instance)
    } catch (error) {
      await this.manager.remove(instance.id)
      throw error
    }
    if (instance.enabled) await supervisor.start()
    return this.toDto(instance)
  }

  /**
   * Stores and applies the new config (omitted secrets keep their value); a running instance
   * restarts with it, and `enabled` decides whether it runs afterwards.
   * @throws HttpError 404, 400 when `plugin` differs, 409 for a taken slug or an unavailable plugin
   */
  async update(id: string, input: PluginInstanceInput): Promise<PluginInstanceDto> {
    const previous = this.stored(id)
    const parsed = PluginInstanceInputSchema.parse(input)
    if (parsed.plugin !== previous.plugin) throw HttpError.badRequest("the plugin of an instance can't change")
    const supervisor = this.supervisor(id)
    const config = this.secrets(previous.plugin).merge(parsed.config, previous.config)
    const instance: PluginInstanceConfig = { ...parsed, id, config }
    await PluginService.domainAsync(() => this.manager.update(instance))
    try {
      this.repo.save(instance)
    } catch (error) {
      await this.manager.update(previous)
      throw error
    }
    if (previous.slug !== instance.slug) this.cleanup.forget(`system/plugin/${previous.slug}/#`, "system")
    if (instance.enabled) await supervisor.start()
    else await supervisor.stop()
    return this.toDto(instance)
  }

  /** deletes the instance, its signals and their wires, its store, and everything on its topics */
  async remove(id: string, by: string) {
    const instance = this.stored(id)
    this.repo.delete(id)
    await this.manager.remove(id)
    this.cleanup.forget(`${instance.plugin}/${instance.slug}/#`, by)
    this.cleanup.forget(`system/plugin/${instance.slug}/#`, by)
  }

  /** runtime only; `enabled` decides what happens at the next boot */
  async start(id: string) {
    await this.supervisor(id).start()
    return this.get(id)
  }

  async stop(id: string) {
    await this.supervisor(id).stop()
    return this.get(id)
  }

  /** @throws HttpError 409 when the instance isn't running */
  catalog(id: string) {
    return PluginService.running(() => this.supervisor(id).calls.catalog())
  }

  panel(id: string) {
    return PluginService.running(() => this.supervisor(id).calls.panel())
  }

  /** @throws HttpError 404 unknown instance, 409 when its plugin isn't available */
  supervisor(id: string) {
    this.stored(id)
    const supervisor = this.manager.get(id)
    if (!supervisor) throw HttpError.conflict(`the plugin of instance "${id}" is not available`)
    return supervisor
  }

  /** secret fields of a plugin's config; none when the plugin is unavailable */
  secrets(plugin: string) {
    return new SecretFields(this.available.get(plugin)?.pkg.description.config ?? {})
  }

  private stored(id: string) {
    const instance = this.repo.get(id)
    if (!instance) throw HttpError.notFound(`plugin instance "${id}"`)
    return instance
  }

  private toDto(instance: PluginInstanceConfig): PluginInstanceDto {
    const supervisor = this.manager.get(instance.id)
    const lastError = supervisor?.lastError
    return {
      id: instance.id, plugin: instance.plugin, slug: instance.slug, label: instance.label, enabled: instance.enabled,
      config: this.secrets(instance.plugin).strip(instance.config),
      state: supervisor?.state ?? "unavailable",
      ...(lastError ? { lastError } : {})
    }
  }

  private static async running<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      throw error instanceof PluginNotRunningError ? HttpError.conflict(error.message) : error
    }
  }

  private static domain<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }

  private static async domainAsync<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }
}
