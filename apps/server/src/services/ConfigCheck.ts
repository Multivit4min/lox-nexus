import type { ConfigExportSchema } from "@lox-nexus/api"
import type { z } from "zod"
import { HttpError } from "../http/HttpError.ts"

/** A parsed import file. */
export type ConfigDocument = z.output<typeof ConfigExportSchema>

/**
 * Checks an import file for what the schema can't see: duplicate ids and slugs (of Miniservers,
 * plugin instances and signals), and wires to signals the file doesn't contain. Runs before anything is deleted, so these mistakes never
 * cost a rollback. Everything else (packet id clashes, transform types) is found while applying.
 */
export class ConfigCheck {
  /**
   * @param existing signal ids wires may use besides the file's: the plugin signals a file without plugin instances keeps
   * @throws HttpError 400 naming the first problem
   */
  static assertConsistent(doc: ConfigDocument, existing: ReadonlySet<string> = new Set()) {
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
    const pluginIds = new Set<string>()
    const pluginSlugs = new Set<string>()
    for (const [i, plugin] of (doc.plugins ?? []).entries()) {
      ConfigCheck.unique(pluginIds, plugin.id, `plugins[${i}]: id "${plugin.id}"`)
      ConfigCheck.unique(pluginSlugs, plugin.slug, `plugins[${i}]: slug "${plugin.slug}"`)
      for (const [j, signal] of plugin.signals.entries()) ConfigCheck.unique(signalIds, signal.id, `plugins[${i}].signals[${j}]: id "${signal.id}"`)
    }
    const wireIds = new Set<string>()
    for (const [i, wire] of doc.wires.entries()) {
      ConfigCheck.unique(wireIds, wire.id, `wires[${i}]: id "${wire.id}"`)
      for (const end of [wire.sourceId, wire.targetId]) {
        if (!signalIds.has(end) && !existing.has(end)) throw HttpError.badRequest(`wires[${i}]: signal "${end}" is not in the file`)
      }
    }
    // a watched signal, Miniserver or instance that isn't in the file would fail only after everything was replaced
    const targets = new Set([...signalIds, ...miniserverIds, ...pluginIds])
    for (const [i, plugin] of (doc.plugins ?? []).entries()) {
      for (const [j, { target }] of (plugin.watch?.rules ?? []).entries()) {
        const id = "signalId" in target ? target.signalId : "miniserverId" in target ? target.miniserverId : target.instanceId
        if (!targets.has(id)) throw HttpError.badRequest(`plugins[${i}].watch.rules[${j}]: "${id}" is not in the file`)
      }
    }
  }

  private static unique(seen: Set<string>, value: string, what: string) {
    if (seen.has(value)) throw HttpError.badRequest(`${what} appears twice`)
    seen.add(value)
  }
}
