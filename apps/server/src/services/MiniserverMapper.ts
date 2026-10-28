import type { DiscoveredPacketDto, LoadBreakdownDto, LoxoneSignalDto, MiniserverDto, MiniserverLoadDto } from "@lox-nexus/api"
import { IciValueMapper, IntercomLoad, type DiscoveredPacket, type LoadBreakdown, type LoxoneSignalConfig, type Miniserver } from "@lox-nexus/loxone"

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
    const { current, breakdown } = miniserver.loadNow()
    return {
      limitPerSecond: IntercomLoad.LIMIT_PER_SECOND,
      windowSeconds: IntercomLoad.WINDOW_SECONDS,
      sampleMs: IntercomLoad.SAMPLE_MS,
      current,
      breakdown: MiniserverMapper.round(breakdown),
      history: miniserver.load.history()
    }
  }

  // computed unrounded by the Miniserver, so the parts add up to `current.percent`; rounded only here
  private static round(parts: LoadBreakdown): LoadBreakdownDto {
    const round = (percent: number) => Math.round(percent * 1000) / 1000
    return {
      signals: round(parts.signals), unconfigured: round(parts.unconfigured), otherTargets: round(parts.otherTargets),
      encrypted: round(parts.encrypted), protocol: round(parts.protocol), recentlyChanged: round(parts.recentlyChanged)
    }
  }

  /** the topic is empty only if the signal vanished from the Miniserver in between, which the callers exclude */
  static signalToDto(miniserver: Miniserver, signal: LoxoneSignalConfig): LoxoneSignalDto {
    return {
      ...signal, miniserverId: miniserver.config.id, topic: miniserver.topicOf(signal.id) ?? "",
      valueType: IciValueMapper.signalValueType(signal)
    }
  }

  /** a copy, so later discovery updates can't change a response being serialised */
  static discoveredToDto(packet: DiscoveredPacket): DiscoveredPacketDto {
    return { ...packet }
  }
}
