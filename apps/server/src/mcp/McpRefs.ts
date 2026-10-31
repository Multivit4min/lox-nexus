import type { LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { HttpError } from "../http/HttpError.ts"

/** the services refs are looked up in */
export interface RefSources {
  miniservers: { list(): MiniserverDto[] }
  loxoneSignals: { list(miniserverId: string): LoxoneSignalDto[] }
}

/** Finds what an agent names: a Miniserver by slug (or id), a Loxone signal by topic (or id). */
export class McpRefs {
  constructor(private readonly sources: RefSources) {}

  /** @throws HttpError 404 naming the slugs there are */
  miniserver(ref: string): MiniserverDto {
    const all = this.sources.miniservers.list()
    const found = all.find(ms => ms.slug === ref || ms.id === ref)
    if (!found) throw HttpError.notFound(`Miniserver "${ref}" (there are: ${all.map(ms => ms.slug).join(", ") || "none"})`)
    return found
  }

  /** @throws HttpError 404 */
  loxoneSignal(ref: string): { miniserver: MiniserverDto; signal: LoxoneSignalDto } {
    for (const miniserver of this.sources.miniservers.list()) {
      const signal = this.sources.loxoneSignals.list(miniserver.id).find(entry => entry.topic === ref || entry.id === ref)
      if (signal) return { miniserver, signal }
    }
    throw HttpError.notFound(`Loxone signal "${ref}" (use list_signals with a direction of in or out)`)
  }
}
