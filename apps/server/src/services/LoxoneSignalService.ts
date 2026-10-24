import { randomUUID } from "node:crypto"
import { LoxoneSignalInputSchema, type AdoptPacket, type DiscoveredPacketDto, type LoxoneSignalDto, type LoxoneSignalInput } from "@lox-nexus/api"
import { LoxoneSignalConfigSchema, type Miniserver, type MiniserverManager } from "@lox-nexus/loxone"
import type { Logger } from "pino"
import type { LoxoneSignalRepository } from "../db/repositories/LoxoneSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { MiniserverMapper } from "./MiniserverMapper.ts"
import type { TopicCleanup } from "./TopicCleanup.ts"

/** The signals of a Miniserver and adoption of discovered packet ids. Signal ids are UUIDs, because SignalRegistry ids are global. */
export class LoxoneSignalService {
  constructor(
    private readonly repo: LoxoneSignalRepository,
    private readonly manager: MiniserverManager,
    private readonly cleanup: TopicCleanup,
    private readonly log: Logger
  ) {}

  /** registers the stored signals of a Miniserver at boot; a broken row is logged and skipped */
  load(miniserverId: string) {
    const miniserver = this.require(miniserverId)
    for (const stored of this.repo.listFor(miniserverId)) {
      try {
        // parsing strips miniserverId and checks values a newer version may have written
        miniserver.addSignal(LoxoneSignalConfigSchema.parse(stored))
      } catch (error) {
        this.log.error({ err: error, signal: stored.id }, "skipping loxone signal that can't be loaded")
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
      // wires the first update made inactive (e.g. a new direction) stay inactive until the next boot;
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
    const miniserver = this.require(miniserverId)
    const topic = miniserver.topicOf(signalId)
    if (!topic) throw HttpError.notFound(`signal "${signalId}"`)
    this.repo.delete(signalId)
    miniserver.removeSignal(signalId)
    this.cleanup.forget(topic, by)
  }

  /** packet ids seen on the wire but not configured, including those already adopted */
  discovered(miniserverId: string): DiscoveredPacketDto[] {
    return this.require(miniserverId).discovery.list().map(MiniserverMapper.discoveredToDto)
  }

  /**
   * Turns a discovered packet id into an input signal of the data type it was seen with.
   * @throws HttpError 404 for a packet that was not discovered, 400 for a data type the bridge can't map
   */
  adopt(miniserverId: string, input: AdoptPacket): LoxoneSignalDto {
    const packet = this.require(miniserverId).discovery.list().find(entry => entry.packetId === input.packetId)
    if (!packet) throw HttpError.notFound(`discovered packet "${input.packetId}"`)
    if (!LoxoneSignalInputSchema.shape.dataType.safeParse(packet.dataType).success) throw HttpError.badRequest(`data type ${packet.dataType} is not supported`)
    // an RGBW packet that discovery decoded as a colour temperature came from a Lumitech output:
    // adopted without the option, the temperature it showed would be lost
    const lumitech = packet.dataType === 4 && packet.value?.type === "tunableWhite"
    return this.add(miniserverId, LoxoneSignalInputSchema.parse({
      packetId: packet.packetId, direction: "in", dataType: packet.dataType, label: input.label ?? packet.packetId, slug: input.slug,
      ...(lumitech ? { lumitech } : {})
    }))
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
