import { BridgeRequestSchema, type BridgeItem, type BridgeResultDto, type LoxoneSignalDto, type PluginSignalDto } from "@lox-nexus/api"
import { Topic, WireSchema } from "@lox-nexus/core"
import type { Logger } from "pino"
import { HttpError } from "../http/HttpError.ts"
import { FreeSlug } from "./FreeSlug.ts"
import type { LoxoneSignalService } from "./LoxoneSignalService.ts"
import type { PluginSignalService } from "./PluginSignalService.ts"
import type { WireService } from "./WireService.ts"

/** what an item created so far, newest last, with how to remove it again */
type Undo = Array<{ what: string; run: () => unknown }>

const WIRE_LABEL_MAX = WireSchema.shape.label.maxLength ?? 200

/**
 * Connects plugin signals to a Miniserver in one step: the plugin signal (existing or new), a
 * Loxone signal for it and the wire between them. A sensor gets a Loxone output, an actuator a
 * Loxone input. Items are independent: one that fails is undone completely and the others go on.
 * Loxone topic names that aren't given are made unique (kitchen-temperature-2), because catalog
 * entries in different places often share a name (PluginSignalService does the same for the plugin
 * side). Two requests at the same time may still pick the same name; the later item then fails
 * with the 409 and can be retried.
 */
export class PluginBridgeService {
  constructor(
    private readonly pluginSignals: Pick<PluginSignalService, "list" | "add" | "remove">,
    private readonly loxoneSignals: Pick<LoxoneSignalService, "list" | "add" | "remove" | "forgetDiscovered">,
    private readonly wires: Pick<WireService, "create" | "sync">,
    private readonly log: Pick<Logger, "warn" | "error">
  ) {}

  /**
   * @returns one result per item, in request order
   * @throws ZodError 400; HttpError 404 for an unknown instance or Miniserver, before anything is created
   */
  async bridge(instanceId: string, input: unknown, by: string): Promise<BridgeResultDto[]> {
    const { miniserverId, items } = BridgeRequestSchema.parse(input)
    this.pluginSignals.list(instanceId)
    this.loxoneSignals.list(miniserverId)
    const results: BridgeResultDto[] = []
    // one after the other: each item's free topic names depend on the ones before
    for (const item of items) results.push(await this.one(instanceId, miniserverId, item, by))
    return results
  }

  private async one(instanceId: string, miniserverId: string, item: BridgeItem, by: string): Promise<BridgeResultDto> {
    const undo: Undo = []
    let label = item.plugin.type === "new" ? item.plugin.signal.label : item.plugin.signalId
    try {
      const signal = await this.pluginSignal(instanceId, item.plugin, by, undo)
      label = signal.label
      const loxone = this.loxoneSignal(miniserverId, signal, item.loxone, by, undo)
      const sensor = signal.kind === "sensor"
      const [from, to] = sensor ? [signal, loxone] : [loxone, signal]
      const wire = this.wires.create({
        label: `${from.label} → ${to.label}`.slice(0, WIRE_LABEL_MAX), sourceId: from.id, targetId: to.id, transforms: [], enabled: true, syncOnStart: false
      })
      // a sensor's value goes to the Miniserver now, not at its next change; the other way round
      // would act on the device with whatever the Miniserver last sent
      if (sensor) this.wires.sync(wire.id)
      else this.loxoneSignals.forgetDiscovered(miniserverId, loxone.packetId, by)
      return { ok: true, signal, loxone, wire }
    } catch (error) {
      if (!(error instanceof HttpError)) this.log.error({ err: error, instanceId, miniserverId }, "connecting a plugin signal to a Miniserver failed")
      const leftover = await this.undo(undo)
      return { ok: false, label, error: error instanceof Error ? error.message : String(error), ...(leftover.length ? { leftover } : {}) }
    }
  }

  // newest first, so the Loxone signal (and with it the wire) goes before the plugin signal;
  // @returns what couldn't be removed
  private async undo(steps: Undo) {
    const leftover: string[] = []
    for (const step of steps.reverse()) {
      try {
        await step.run()
      } catch (error) {
        this.log.warn({ err: error, leftover: step.what }, "undoing a failed connection to a Miniserver failed")
        leftover.push(step.what)
      }
    }
    return leftover
  }

  private async pluginSignal(instanceId: string, plugin: BridgeItem["plugin"], by: string, undo: Undo): Promise<PluginSignalDto> {
    const existing = this.pluginSignals.list(instanceId)
    if (plugin.type === "existing") {
      const signal = existing.find(s => s.id === plugin.signalId)
      if (!signal) throw HttpError.notFound(`signal "${plugin.signalId}"`)
      return signal
    }
    // without a slug, add() picks a free one
    const signal = await this.pluginSignals.add(instanceId, plugin.signal)
    undo.push({ what: `plugin signal "${signal.label}"`, run: () => this.pluginSignals.remove(instanceId, signal.id, by) })
    return signal
  }

  private loxoneSignal(miniserverId: string, signal: PluginSignalDto, input: BridgeItem["loxone"], by: string, undo: Undo): LoxoneSignalDto {
    const direction = signal.kind === "sensor" ? "out" : "in"
    const label = input.label ?? signal.label
    const taken = new Set(this.loxoneSignals.list(miniserverId).filter(s => s.direction === direction).map(s => s.topic.split("/").at(-1)!))
    const slug = input.slug ?? FreeSlug.pick(Topic.slug(label), taken)
    const loxone = this.loxoneSignals.add(miniserverId, { packetId: input.packetId, dataType: input.dataType, direction, label, slug })
    undo.push({ what: `Loxone signal "${loxone.label}" (${loxone.packetId})`, run: () => this.loxoneSignals.remove(miniserverId, loxone.id, by) })
    return loxone
  }
}
