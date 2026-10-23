import type { ConfigExportSchema } from "@lox-nexus/api"
import type { z } from "zod"
import { HttpError } from "../http/HttpError.ts"

/** A parsed import file. */
export type ConfigDocument = z.output<typeof ConfigExportSchema>

/**
 * Checks an import file for what the schema can't see: duplicate ids and slugs, and wires to
 * signals the file doesn't contain. Runs before anything is deleted, so these mistakes never
 * cost a rollback. Everything else (packet id clashes, transform types) is found while applying.
 */
export class ConfigCheck {
  /** @throws HttpError 400 naming the first problem */
  static assertConsistent(doc: ConfigDocument) {
    const miniserverIds = new Set<string>()
    const slugs = new Set<string>()
    const signalIds = new Set<string>()
    for (const [i, ms] of doc.miniservers.entries()) {
      ConfigCheck.unique(miniserverIds, ms.id, `miniservers[${i}]: id "${ms.id}"`)
      ConfigCheck.unique(slugs, ms.slug, `miniservers[${i}]: slug "${ms.slug}"`)
      for (const [j, signal] of ms.signals.entries()) {
        ConfigCheck.unique(signalIds, signal.id, `miniservers[${i}].signals[${j}]: id "${signal.id}"`)
      }
    }
    const wireIds = new Set<string>()
    for (const [i, wire] of doc.wires.entries()) {
      ConfigCheck.unique(wireIds, wire.id, `wires[${i}]: id "${wire.id}"`)
      for (const end of [wire.sourceId, wire.targetId]) {
        if (!signalIds.has(end)) throw HttpError.badRequest(`wires[${i}]: signal "${end}" is not in the file`)
      }
    }
  }

  private static unique(seen: Set<string>, value: string, what: string) {
    if (seen.has(value)) throw HttpError.badRequest(`${what} appears twice`)
    seen.add(value)
  }
}
