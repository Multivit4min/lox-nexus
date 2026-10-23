import { randomUUID } from "node:crypto"
import { LoxoneSignalInputSchema, type AdoptPacket, type DiscoveredPacketDto, type LoxoneSignalDto, type LoxoneSignalInput } from "@lox-nexus/api"
import { LoxoneSignalConfigSchema, type Miniserver, type MiniserverManager } from "@lox-nexus/loxone"
import type { Logger } from "pino"
import type { LoxoneSignalRepository } from "../db/repositories/LoxoneSignalRepository.ts"
import { HttpError } from "../http/HttpError.ts"
import { MiniserverMapper } from "./MiniserverMapper.ts"

/** The signals of a Miniserver and adoption of discovered packet ids. Signal ids are UUIDs, because SignalRegistry ids are global. */
export class LoxoneSignalService {
  constructor(
    private readonly repo: LoxoneSignalRepository,
    private readonly manager: MiniserverManager,
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

  list(miniserverId: string): LoxoneSignalDto[] {
    const miniserver = this.require(miniserverId)
    return miniserver.signals().map(signal => MiniserverMapper.signalToDto(miniserver, signal))
  }

  /** registers first (validates and checks for duplicates), then stores; undone if storing fails */
  add(miniserverId: string, input: LoxoneSignalInput): LoxoneSignalDto {
    const miniserver = this.require(miniserverId)
    const config = LoxoneSignalService.domain(() => miniserver.addSignal({ ...input, id: randomUUID() }))
    try {
      this.repo.insert({ ...config, miniserverId })
    } catch (error) {
      miniserver.removeSignal(config.id)
      throw error
    }
    return MiniserverMapper.signalToDto(miniserver, config)
  }

  /** deletes the signal and its wires */
  remove(miniserverId: string, signalId: string) {
    const miniserver = this.require(miniserverId)
    if (!miniserver.signals().some(signal => signal.id === signalId)) throw HttpError.notFound(`signal "${signalId}"`)
    this.repo.delete(signalId)
    miniserver.removeSignal(signalId)
  }

  discovered(miniserverId: string): DiscoveredPacketDto[] {
    return this.require(miniserverId).discovery.list().map(MiniserverMapper.discoveredToDto)
  }

  /** turns a discovered packet id into an input signal of the data type it was seen with */
  adopt(miniserverId: string, input: AdoptPacket): LoxoneSignalDto {
    const packet = this.require(miniserverId).discovery.list().find(entry => entry.packetId === input.packetId)
    if (!packet) throw HttpError.notFound(`discovered packet "${input.packetId}"`)
    if (packet.dataType > 6) throw HttpError.badRequest(`data type ${packet.dataType} is not supported`)
    return this.add(miniserverId, LoxoneSignalInputSchema.parse({
      packetId: packet.packetId, direction: "in", dataType: packet.dataType, label: input.label ?? packet.packetId, slug: input.slug
    }))
  }

  private require(miniserverId: string): Miniserver {
    const miniserver = this.manager.get(miniserverId)
    if (!miniserver) throw HttpError.notFound(`miniserver "${miniserverId}"`)
    return miniserver
  }

  private static domain<T>(work: () => T): T {
    try {
      return work()
    } catch (error) {
      throw HttpError.fromDomain(error)
    }
  }
}
