import { randomUUID } from "node:crypto"
import { PluginSignalInputSchema, type PluginSignalDto, type PluginSignalInput } from "@lox-nexus/api"
import { PluginRequestError, PluginUnavailableError, Topic, type PluginSignalConfig, type PluginSignalEntry, type PluginSupervisor } from "@lox-nexus/core"
import type { PluginSignalRepository } from "../db/repositories/PluginSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { FreeSlug } from "./FreeSlug.ts"
import type { PluginService } from "./PluginService.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"

/**
 * The sensors and actuators of plugin instances. Signals are registered on the bus at once (so
 * wires can be built while the plugin is stopped); a running plugin validates the params, and
 * one it refuses is not kept (400 with the plugin's message). A stopped plugin checks them at its
 * next start; a refused signal then shows its `error`. Without a slug, one is made from the label
 * and numbered when taken (value, value-2): generic names such as "Value" repeat often. A slug
 * given explicitly must be free.
 */
export class PluginSignalService {
  constructor(
    private readonly repo: PluginSignalRepository,
    private readonly instances: Pick<PluginService, "supervisor">,
    private readonly cleanup: TopicCleanup
  ) {}

  /** @throws HttpError 404 unknown instance, 409 unavailable plugin */
  list(instanceId: string): PluginSignalDto[] {
    return this.instances.supervisor(instanceId).signals.list().map(entry => PluginSignalService.toDto(instanceId, entry))
  }

  /** @throws HttpError 400 unknown capability or refused params, 409 taken slug */
  async add(instanceId: string, input: PluginSignalInput): Promise<PluginSignalDto> {
    const supervisor = this.instances.supervisor(instanceId)
    const config = this.configOf(supervisor, randomUUID(), input)
    this.repo.insert(instanceId, config)
    try {
      await PluginSignalService.refusals(() => supervisor.calls.addSignal(config))
    } catch (error) {
      this.repo.delete(config.id)
      throw error
    }
    return PluginSignalService.toDto(instanceId, this.require(supervisor, config.id))
  }

  /**
   * Replaces a signal's params, label and slug (same id); its wires stay, its value and force
   * follow a new topic. Kind and capability can't change: that is a different signal, whose
   * wires wouldn't fit.
   * @throws HttpError 400 for a changed kind or capability or refused params, 404, 409 taken slug or an orphaned signal
   */
  async update(instanceId: string, signalId: string, input: PluginSignalInput, by: string): Promise<PluginSignalDto> {
    const supervisor = this.instances.supervisor(instanceId)
    const previous = this.require(supervisor, signalId)
    // the plugin can't check params for a capability it no longer has
    if (previous.orphaned) throw HttpError.conflict(`${previous.error ?? "the plugin no longer offers this signal"}: roll the plugin back or delete the signal`)
    const config = this.configOf(supervisor, signalId, input)
    if (config.kind !== previous.config.kind || config.capability !== previous.config.capability) {
      throw HttpError.badRequest("kind and capability of a signal can't change; add a new signal instead")
    }
    await PluginSignalService.refusals(() => supervisor.calls.updateSignal(config))
    try {
      this.repo.update(instanceId, config)
    } catch (error) {
      await supervisor.calls.updateSignal(previous.config).catch(() => undefined)
      throw error
    }
    const updated = this.require(supervisor, signalId)
    if (updated.topic !== previous.topic) this.cleanup.move(previous.topic, updated.topic, by)
    return PluginSignalService.toDto(instanceId, updated)
  }

  /** deletes the signal, its wires, and its force and stored value */
  async remove(instanceId: string, signalId: string, by: string) {
    const supervisor = this.instances.supervisor(instanceId)
    const { topic } = this.require(supervisor, signalId)
    this.repo.delete(signalId)
    await supervisor.calls.removeSignal(signalId)
    this.cleanup.forget(topic, by)
  }

  // the capability is checked here so a stopped plugin's signals can't name something it doesn't offer
  private configOf(supervisor: PluginSupervisor, id: string, input: PluginSignalInput): PluginSignalConfig {
    const parsed = PluginSignalInputSchema.parse(input)
    const { description } = supervisor.pkg
    const offered = parsed.kind === "sensor" ? description.sensors : description.actuators
    if (!offered.some(capability => capability.id === parsed.capability)) {
      throw HttpError.badRequest(`${supervisor.pkg.name} has no ${parsed.kind} "${parsed.capability}"`)
    }
    if (parsed.slug) return { id, ...parsed, slug: parsed.slug }
    const taken = new Set(supervisor.signals.list().filter(e => e.config.kind === parsed.kind && e.config.id !== id).map(e => e.config.slug))
    return { id, ...parsed, slug: FreeSlug.pick(Topic.slug(parsed.label || parsed.capability), taken) }
  }

  private require(supervisor: PluginSupervisor, signalId: string) {
    const entry = supervisor.signals.get(signalId)
    if (!entry) throw HttpError.notFound(`signal "${signalId}"`)
    return entry
  }

  // the plugin refusing params is the user's mistake (400); a taken topic is a conflict (409); a
  // plugin that timed out or stopped meanwhile is unavailable (503)
  private static async refusals(work: () => Promise<void>) {
    try {
      await work()
    } catch (error) {
      if (error instanceof PluginRequestError) throw HttpError.badRequest(error.message)
      if (error instanceof PluginUnavailableError) throw new HttpError(503, error.message)
      throw HttpError.fromDomain(error)
    }
  }

  private static toDto(instanceId: string, entry: PluginSignalEntry): PluginSignalDto {
    const { config, topic, valueType, error, orphaned } = entry
    return { ...config, instanceId, topic, valueType, ...(error ? { error } : {}), ...(orphaned ? { orphaned } : {}) }
  }
}
