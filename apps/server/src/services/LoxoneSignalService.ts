import { randomUUID } from "node:crypto"
import { LoxoneSignalInputSchema, type AdoptPacket, type DiscoveredPacketDto, type LoxoneSignalDto, type LoxoneSignalInput } from "@lox-nexus/api"
import { LoxoneSignalConfigSchema, type Miniserver, type MiniserverManager } from "@lox-nexus/loxone"
import type { Logger } from "pino"
import type { LoxoneSignalRepository } from "../db/repositories/LoxoneSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { MiniserverMapper } from "./MiniserverMapper.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"
import type { UnloadableRows } from "./UnloadableRows.ts"

/** The signals of a Miniserver and adoption of discovered packet ids. Signal ids are UUIDs, because SignalRegistry ids are global. */
export class LoxoneSignalService {
  constructor(
    private readonly repo: LoxoneSignalRepository,
    private readonly manager: Pick<MiniserverManager, "get">,
    private readonly cleanup: TopicCleanup,
    private readonly unloadable: UnloadableRows,
    private readonly log: Logger
  ) {}

  /** registers the stored signals of a Miniserver at boot; a broken row is logged and listed as unloadable */
  load(miniserverId: string) {
    const miniserver = this.require(miniserverId)
    for (const stored of this.repo.listFor(miniserverId)) {
      try {
        // parsing strips miniserverId and checks values a newer version may have written
        miniserver.addSignal(LoxoneSignalConfigSchema.parse(stored))
      } catch (error) {
        this.log.error({ err: error, signal: stored.id }, "skipping loxone signal that can't be loaded")
        this.unloadable.add({ kind: "signal", id: stored.id, miniserverId, label: String(stored.label), error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  /** @throws HttpError 404 for an unknown Miniserver */
  list(miniserverId: string): LoxoneSignalDto[] {
    const miniserver = this.require(miniserverId)
    return miniserver.signals().map(signal => MiniserverMapper.signalToDto(miniserver, signal))
  }

  /**
   * Registers first (validates and checks for duplicates), then stores; undone if storing fails.
   * @param id assigned when absent; an import passes the exported one
   * @throws HttpError 409 for a duplicate id, packet id or slug, 404 for an unknown Miniserver
   */
  add(miniserverId: string, input: LoxoneSignalInput, id: string = randomUUID()): LoxoneSignalDto {
    const miniserver = this.require(miniserverId)
    const config = LoxoneSignalService.domain(() => miniserver.addSignal({ ...input, id }))
    try {
      this.repo.insert({ ...config, miniserverId })
    } catch (error) {
      miniserver.removeSignal(config.id)
      throw error
    }
    return MiniserverMapper.signalToDto(miniserver, config)
  }

  /**
   * Replaces the signal's config; its wires stay. When the topic changes, its last value (flagged
   * restored, so wires don't act on it) and a force move along. Applied first, then stored; undone
   * if storing fails.
   * @throws HttpError 404 unknown Miniserver or signal, 409 for a packet id or topic another signal has
   */
  update(miniserverId: string, signalId: string, input: LoxoneSignalInput, by: string): LoxoneSignalDto {
    const miniserver = this.require(miniserverId)
    const previous = miniserver.signals().find(signal => signal.id === signalId)
    const before = miniserver.topicOf(signalId)
    if (!previous || !before) throw HttpError.notFound(`signal "${signalId}"`)
    const config = LoxoneSignalService.domain(() => miniserver.updateSignal({ ...input, id: signalId }))
    try {
      this.repo.update({ ...config, miniserverId })
    } catch (error) {
      // putting the signal back also restarts wires the first update dropped (WireEngine.restartDropped);
      // storing only fails when runtime and database disagree, which is a bug of its own
      miniserver.updateSignal(previous)
      throw error
    }
    const after = miniserver.topicOf(signalId)!
    if (after !== before) this.cleanup.move(before, after, by)
    return MiniserverMapper.signalToDto(miniserver, config)
  }

  /**
   * Deletes the signal, its wires, and its force and stored value. `by` is recorded as the one
   * who released a force.
   * @throws HttpError 404
   */
  remove(miniserverId: string, signalId: string, by: string) {
    // it never got a topic, so there is nothing to clean up on one
    if (this.unloadable.signal(miniserverId, signalId)) return this.forgetUnloadable(signalId)
    const miniserver = this.require(miniserverId)
    const topic = miniserver.topicOf(signalId)
    if (!topic) throw HttpError.notFound(`signal "${signalId}"`)
    this.repo.delete(signalId)
    miniserver.removeSignal(signalId)
    this.cleanup.forget(topic, by)
  }

  private forgetUnloadable(signalId: string) {
    this.repo.delete(signalId)
    this.unloadable.forget(signalId)
  }

  /** packet ids seen on the wire but not configured, including those already adopted */
  discovered(miniserverId: string): DiscoveredPacketDto[] {
    return this.require(miniserverId).discovery.list().map(MiniserverMapper.discoveredToDto)
  }

  /**
   * Turns a discovered packet id into an input signal of the data type it was seen with.
   * @throws HttpError 404 for a packet that was not discovered, 400 for a data type the bridge can't map
   */
  adopt(miniserverId: string, input: AdoptPacket, by: string): LoxoneSignalDto {
    const miniserver = this.require(miniserverId)
    const packet = miniserver.discovery.list().find(entry => entry.packetId === input.packetId)
    if (!packet) throw HttpError.notFound(`discovered packet "${input.packetId}"`)
    if (!LoxoneSignalInputSchema.shape.dataType.safeParse(packet.dataType).success) throw HttpError.badRequest(`data type ${packet.dataType} is not supported`)
    const signal = this.add(miniserverId, LoxoneSignalInputSchema.parse({
      packetId: packet.packetId, direction: "in", dataType: packet.dataType, label: input.label ?? packet.packetId, slug: input.slug
    }))
    this.forgetDiscovered(miniserverId, packet.packetId, by)
    return signal
  }

  /** for a new input: its own topic shows the packet's values now; the discovered one would linger until restart */
  forgetDiscovered(miniserverId: string, packetId: string, by: string) {
    this.cleanup.forget(this.require(miniserverId).topics.discovered(packetId), by)
  }

  // @throws HttpError 404
  private require(miniserverId: string): Miniserver {
    const miniserver = this.manager.get(miniserverId)
    if (!miniserver) throw HttpError.notFound(`miniserver "${miniserverId}"`)
    return miniserver
  }

  // domain rule violations from the Loxone package become 409s
  private static domain<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }
}
