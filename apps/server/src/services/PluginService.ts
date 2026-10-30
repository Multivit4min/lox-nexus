import { randomUUID } from "node:crypto"
import { PluginNotRunningError, PluginRequestError, PluginUnavailableError, type PluginInstanceConfig, type PluginManager, type PluginPackage, type PluginSupervisor } from "@lox-nexus/core"
import type { PluginInstanceDto, PluginInstanceInput, PluginPackageDto } from "@lox-nexus/api"
import { PluginInstanceInputSchema } from "@lox-nexus/api"
import type { Logger } from "pino"
import type { PluginInstanceRepository } from "../db/repositories/PluginInstanceRepository.ts"
import type { PluginSignalRepository } from "../db/repositories/PluginSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { SecretFields } from "../plugins/SecretFields.ts"
import type { PluginSettingsCheck, PreparedConfig } from "./PluginSettingsCheck.ts"
import type { PluginLogs } from "./PluginLogs.ts"
import type { SelectionService } from "./SelectionService.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"
import type { WireService } from "./WireService.ts"

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
    private readonly manager: Pick<PluginManager, "add" | "get" | "list" | "remove" | "replacePackage" | "update">,
    private readonly available: Pick<PluginCatalog, "get" | "list">,
    private readonly cleanup: TopicCleanup,
    private readonly log: Logger,
    private readonly logs: Pick<PluginLogs, "forget">,
    private readonly wires: Pick<WireService, "sendAll">,
    /** a watching instance's choice of signals goes with it */
    private readonly selections?: Pick<SelectionService, "forget">,
    /** checks settings before they are saved; without it they are saved as they come */
    readonly settings?: PluginSettingsCheck
  ) {}

  /** builds the runtime from the database at boot; a broken signal row is logged and skipped */
  load() {
    for (const instance of this.repo.list()) {
      const entry = this.available.get(instance.plugin)
      if (entry) this.attach(instance, entry.pkg)
      else this.log.warn({ instance: instance.id, plugin: instance.plugin }, "plugin instance can't run: its plugin is not available")
    }
  }

  /**
   * A plugin was (re)loaded, after an edit in development or an install, update or rollback:
   * running instances restart with it, enabled instances in error or crashed start on it, and
   * instances that were unavailable get a supervisor and start if enabled. Instances stopped by
   * hand stay stopped.
   */
  async packageChanged(pkg: PluginPackage) {
    // an update may be the fix: enabled instances that failed start on it rather than staying down
    const failed = this.manager.list()
      .filter(supervisor => supervisor.config.plugin === pkg.id && supervisor.config.enabled && (supervisor.state === "error" || supervisor.state === "crashed"))
    await this.manager.replacePackage(pkg)
    // checked again: the update took a while, and the user may have stopped, disabled or deleted one meanwhile
    const restart = failed.filter(supervisor => this.manager.get(supervisor.config.id) === supervisor && supervisor.config.enabled && supervisor.state === "stopped")
    const waiting = this.repo.list().filter(instance => instance.plugin === pkg.id && !this.manager.get(instance.id))
    // attached synchronously, so a concurrent call (a development reload) can't attach one twice
    const attached = waiting.map(instance => ({ instance, supervisor: this.attach(instance, pkg) }))
    await Promise.all([
      ...restart.map(supervisor => supervisor.start()),
      ...attached.filter(({ instance }) => instance.enabled).map(({ supervisor }) => supervisor.start())
    ])
  }

  /** the plugins that can be instantiated; secret handling is per instance, see secrets() */
  packages(): PluginPackageDto[] {
    return this.available.list().map(({ pkg, version, icon, source }) => ({ id: pkg.id, name: pkg.name, version, source, description: pkg.description, ...(icon ? { icon } : {}) }))
  }

  /** every stored instance, including unavailable ones (state "unavailable"); secrets are stripped */
  list(): PluginInstanceDto[] {
    return this.repo.list().map(instance => this.toDto(instance))
  }

  /** @throws HttpError 404 */
  get(id: string): PluginInstanceDto {
    return this.toDto(this.stored(id))
  }

  /** @throws HttpError 400 for an unknown plugin, ZodError 400 for settings the plugin refuses, 409 for a taken slug */
  async create(input: PluginInstanceInput): Promise<PluginInstanceDto> {
    const parsed = PluginInstanceInputSchema.parse(input)
    const entry = this.available.get(parsed.plugin)
    if (!entry) throw HttpError.badRequest(`plugin "${parsed.plugin}" is not available`)
    const { config, configVersion }: PreparedConfig = await this.settings?.prepare(parsed.plugin, parsed.config) ?? { config: parsed.config }
    const instance: PluginInstanceConfig = { id: randomUUID(), ...parsed, config, ...(configVersion === undefined ? {} : { configVersion }) }
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
   * @throws HttpError 404, 400 when `plugin` differs, 409 for a taken slug or an unavailable plugin; ZodError 400 for settings the plugin refuses
   */
  async update(id: string, input: PluginInstanceInput, by: string): Promise<PluginInstanceDto> {
    const previous = this.stored(id)
    const parsed = PluginInstanceInputSchema.parse(input)
    if (parsed.plugin !== previous.plugin) throw HttpError.badRequest("the plugin of an instance can't change")
    // unavailable instances hold slugs too, and the manager doesn't know them
    if (this.repo.list().some(other => other.id !== id && other.slug === parsed.slug)) throw HttpError.conflict(`slug "${parsed.slug}" is already used by another plugin instance`)
    const supervisor = this.supervisor(id)
    const merged = this.secrets(previous.plugin).merge(parsed.config, previous.config)
    const { storeWrites, ...checked } = await this.settings?.prepare(previous.plugin, merged, previous) ?? { config: merged, ...PluginService.version(previous) }
    const instance: PluginInstanceConfig = { ...parsed, id, ...checked }
    const topics = new Map(supervisor.signals.list().map(entry => [entry.config.id, entry.topic]))
    if (!instance.enabled) await supervisor.stop()
    await PluginService.domainAsync(() => this.manager.update(instance))
    try {
      this.repo.save(instance)
    } catch (error) {
      await this.manager.update(previous)
      if (previous.enabled) await supervisor.start()
      throw error
    }
    this.settings?.applyStore(id, storeWrites)
    if (previous.slug !== instance.slug) this.moveTopics(supervisor, topics, previous.slug, by)
    if (instance.enabled) await supervisor.start()
    return this.toDto(instance)
  }

  // values and forces follow the signals to their new topics, like a renamed signal's do
  private moveTopics(supervisor: PluginSupervisor, before: Map<string, string>, oldSlug: string, by: string) {
    for (const entry of supervisor.signals.list()) {
      const old = before.get(entry.config.id)
      if (old && old !== entry.topic) this.cleanup.move(old, entry.topic, by)
    }
    this.cleanup.forget(`system/plugin/${oldSlug}/#`, by)
  }

  /** deletes the instance, its signals and their wires, its store, and everything on its topics */
  async remove(id: string, by: string) {
    const instance = this.stored(id)
    this.repo.delete(id)
    await this.manager.remove(id)
    this.cleanup.forget(`${instance.plugin}/${instance.slug}/#`, by)
    this.cleanup.forget(`system/plugin/${instance.slug}/#`, by)
    this.logs.forget(id)
    this.selections?.forget(id)
  }

  /** runtime only; `enabled` decides what happens at the next boot */
  async start(id: string) {
    await this.supervisor(id).start()
    // its sensors repeat the values they had, which the bus drops as unchanged, so the Miniserver
    // gets them from here; wires to its actuators wait for the next value, as anything else would act on the device
    this.wires.sendAll(id, { resend: true })
    return this.get(id)
  }

  /** runtime only, like start(); the instance runs again at the next boot if enabled */
  async stop(id: string) {
    await this.supervisor(id).stop()
    return this.get(id)
  }

  /** @throws HttpError 409 when the instance isn't running */
  catalog(id: string) {
    return PluginService.running(() => this.supervisor(id).calls.catalog())
  }

  /** @throws HttpError 409 when the instance isn't running; resolves undefined when the plugin has no panel */
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

  /** whether the instance exists and its plugin watches signals (so it has a selection) */
  watches(id: string) {
    return this.manager.get(id)?.pkg.description.watches !== undefined
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

  private attach(instance: PluginInstanceConfig, pkg: PluginPackage) {
    const supervisor = this.manager.add(instance, pkg)
    for (const signal of this.signalRepo.listFor(instance.id)) {
      try {
        // a signal whose capability this version doesn't offer stays registered as an orphan
        supervisor.signals.restore(signal)
      } catch (error) {
        this.log.error({ err: error, signal: signal.id }, "skipping plugin signal that can't be loaded")
      }
    }
    return supervisor
  }

  // without its plugin, nobody can tell which config fields are secret: show none of them
  private toDto(instance: PluginInstanceConfig): PluginInstanceDto {
    const supervisor = this.manager.get(instance.id)
    const lastError = supervisor?.lastError
    const statusMessage = supervisor?.statusMessage
    const secrets = this.available.get(instance.plugin) ? this.secrets(instance.plugin) : undefined
    return {
      id: instance.id, plugin: instance.plugin, slug: instance.slug, label: instance.label, enabled: instance.enabled,
      config: secrets ? secrets.strip(instance.config) : {},
      secrets: secrets ? secrets.present(instance.config) : [],
      state: supervisor?.state ?? "unavailable",
      restarts: supervisor?.restarts ?? 0,
      ...(lastError ? { lastError } : {}),
      ...(statusMessage ? { statusMessage } : {})
    }
  }

  private static version(instance: PluginInstanceConfig) {
    return instance.configVersion === undefined ? {} : { configVersion: instance.configVersion }
  }

  // a plugin that throws in catalog() or panel() is a failing upstream: 502 with its message
  private static async running<T>(work: () => Promise<T>) {
    try {
      return await work()
    } catch (error) {
      if (error instanceof PluginNotRunningError) throw HttpError.conflict(error.message)
      if (error instanceof PluginRequestError) throw new HttpError(502, `the plugin failed: ${error.message}`)
      if (error instanceof PluginUnavailableError) throw new HttpError(503, error.message)
      throw error
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
