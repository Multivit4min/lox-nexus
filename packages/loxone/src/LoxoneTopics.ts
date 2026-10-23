import { Topic } from "@lox-nexus/core"
import type { LoxoneSignalConfig } from "./MiniserverConfig.ts"

/** Builds the readable topics of one Miniserver: loxone/<slug>/{in,out,discovered}/<packet> and its status topic. */
export class LoxoneTopics {
  /** @param slug the Miniserver's topic segment, already validated by MiniserverConfig */
  constructor(private readonly slug: string) {}

  /**
   * Topic of a configured signal; in-signals live under in/, out-signals under out/. The last
   * segment is the signal's own slug, or the slugified packet id when it has none.
   */
  forSignal(signal: Pick<LoxoneSignalConfig, "direction" | "packetId" | "slug">) {
    return `loxone/${this.slug}/${signal.direction}/${signal.slug ?? Topic.slug(signal.packetId)}`
  }

  /** where values of packet ids without a configured signal are shown until someone adopts them */
  discovered(packetId: string) {
    return `loxone/${this.slug}/discovered/${Topic.slug(packetId)}`
  }

  /** pattern matching every out-signal of this Miniserver */
  get outPattern() {
    return `loxone/${this.slug}/out/#`
  }

  /** connection health: "waiting", "online", "stale" or "stopped" */
  get status() {
    return `system/loxone/${this.slug}/status`
  }

  /** send failures and other problems of this Miniserver */
  get errors() {
    return `system/loxone/${this.slug}/error`
  }
}
