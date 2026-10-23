import type { DiscoveredPacketDto, LoxoneSignalDto, MiniserverDto, MiniserverLoadDto } from "@lox-nexus/api"
import { IciValueMapper, IntercomLoad, type DiscoveredPacket, type LoxoneSignalConfig, type Miniserver } from "@lox-nexus/loxone"

/** Runtime objects to API DTOs. The only place that decides what of a Miniserver leaves the server. */
export class MiniserverMapper {
  /** fields are listed one by one, so a secret added to the config later can't leak by default */
  static toDto(miniserver: Miniserver): MiniserverDto {
    const { id, slug, label, host, port, listenPort, listenAddress, ownId, remoteId, password, enabled, resendInterval } = miniserver.config
    const boundPort = miniserver.listenPort
    const lastError = miniserver.lastError
    return {
      id, slug, label, host, port, listenPort, ownId, remoteId, enabled, resendInterval,
      ...(listenAddress === undefined ? {} : { listenAddress }),
      hasPassword: password !== undefined,
      load: Math.round(miniserver.load.current().percent * 10) / 10,
      running: miniserver.isRunning,
      health: miniserver.health,
      ...(boundPort === undefined ? {} : { boundPort }),
      ...(lastError === undefined ? {} : { lastError })
    }
  }

  /** the current intercommunication load with its documented limits and the stored history */
  static loadToDto(miniserver: Miniserver): MiniserverLoadDto {
    return {
      limitPerSecond: IntercomLoad.LIMIT_PER_SECOND,
      windowSeconds: IntercomLoad.WINDOW_SECONDS,
      sampleMs: IntercomLoad.SAMPLE_MS,
      current: miniserver.load.current(),
      history: miniserver.load.history()
    }
  }

  /** the topic is empty only if the signal vanished from the Miniserver in between, which the callers exclude */
  static signalToDto(miniserver: Miniserver, signal: LoxoneSignalConfig): LoxoneSignalDto {
    return {
      ...signal, miniserverId: miniserver.config.id, topic: miniserver.topicOf(signal.id) ?? "",
      valueType: IciValueMapper.valueTypeOf(signal.dataType)
    }
  }

  /** a copy, so later discovery updates can't change a response being serialised */
  static discoveredToDto(packet: DiscoveredPacket): DiscoveredPacketDto {
    return { ...packet }
  }
}
