import type { DiscoveredPacketDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import type { DiscoveredPacket, LoxoneSignalConfig, Miniserver } from "@lox-nexus/loxone"

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
      running: miniserver.isRunning,
      health: miniserver.health,
      ...(boundPort === undefined ? {} : { boundPort }),
      ...(lastError === undefined ? {} : { lastError })
    }
  }

  static signalToDto(miniserver: Miniserver, signal: LoxoneSignalConfig): LoxoneSignalDto {
    return { ...signal, miniserverId: miniserver.config.id, topic: miniserver.topicOf(signal.id) ?? "" }
  }

  static discoveredToDto(packet: DiscoveredPacket): DiscoveredPacketDto {
    return { ...packet }
  }
}
