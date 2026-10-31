import type { PluginInstanceDto, PluginPackageDto, PluginSignalDto } from "@lox-nexus/api"
import { HttpError } from "../../../http/HttpError.ts"

/** the plugin services refs are looked up in */
export interface PluginRefSources {
  plugins: { list(): PluginInstanceDto[]; packages(): PluginPackageDto[] }
}

/** Finds the plugins an agent names: an instance by slug (or id), a plugin by its id or an instance's slug. */
export class PluginRefs {
  constructor(private readonly sources: PluginRefSources) {}

  /** @throws HttpError 404 naming the instances there are */
  instance(ref: string): PluginInstanceDto {
    const all = this.sources.plugins.list()
    const found = all.find(instance => instance.slug === ref || instance.id === ref)
    if (!found) throw HttpError.notFound(`plugin instance "${ref}" (there are: ${all.map(instance => instance.slug).join(", ") || "none"})`)
    return found
  }

  /**
   * a plugin signal by topic (or id), with its instance
   * @throws HttpError 404
   */
  signal(ref: string, signals: { list(instanceId: string): PluginSignalDto[] }): { instance: PluginInstanceDto; signal: PluginSignalDto } {
    for (const instance of this.sources.plugins.list()) {
      if (instance.state === "unavailable") continue
      const signal = signals.list(instance.id).find(entry => entry.topic === ref || entry.id === ref)
      if (signal) return { instance, signal }
    }
    throw HttpError.notFound(`plugin signal "${ref}" (list_signals with direction sensor or actuator names them)`)
  }

  /** @throws HttpError 404 naming the plugins there are */
  package(ref: string): PluginPackageDto {
    const packages = this.sources.plugins.packages()
    const id = packages.some(pkg => pkg.id === ref) ? ref : this.sources.plugins.list().find(instance => instance.slug === ref)?.plugin
    const found = packages.find(pkg => pkg.id === id)
    if (!found) throw HttpError.notFound(`plugin "${ref}" (installed: ${packages.map(pkg => pkg.id).join(", ") || "none"})`)
    return found
  }
}
