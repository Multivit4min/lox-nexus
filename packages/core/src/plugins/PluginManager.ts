import { Disposable } from "@lox-nexus/plugin-sdk"
import { PluginSupervisor, type SupervisorDeps } from "./PluginSupervisor.ts"
import type { PluginInstanceConfig, PluginPackage } from "./PluginTypes.ts"

/**
 * Owns the supervisors of all plugin instances. One failing plugin never stops the others or the
 * boot. Disposing is shutdown (signals and wires stay registered); remove() is deletion.
 */
export class PluginManager extends Disposable {
  private readonly supervisors = new Map<string, PluginSupervisor>()

  constructor(private readonly deps: SupervisorDeps) {
    super()
    this.onDispose(async () => {
      const all = [...this.supervisors.values()]
      this.supervisors.clear()
      await Promise.allSettled(all.map(supervisor => supervisor.dispose()))
    })
  }

  /**
   * Adds an instance without starting it; its signals are added through the supervisor.
   * @throws Error for a duplicate id or a slug another instance uses
   */
  add(instance: PluginInstanceConfig, pkg: PluginPackage) {
    if (this.supervisors.has(instance.id)) throw new Error(`plugin instance "${instance.id}" already exists`)
    this.assertSlugFree(instance)
    const supervisor = new PluginSupervisor(instance, pkg, this.deps)
    this.supervisors.set(instance.id, supervisor)
    return supervisor
  }

  /**
   * Applies a new config (and optionally a package) to an instance, restarting it if it ran.
   * @throws Error for an unknown id or a slug another instance uses
   */
  async update(instance: PluginInstanceConfig, pkg?: PluginPackage) {
    const supervisor = this.supervisors.get(instance.id)
    if (!supervisor) throw new Error(`unknown plugin instance "${instance.id}"`)
    this.assertSlugFree(instance)
    await supervisor.update(instance, pkg)
    return supervisor
  }

  /** undefined for unknown ids */
  get(id: string) {
    return this.supervisors.get(id)
  }

  /** every supervisor, including stopped ones */
  list() {
    return [...this.supervisors.values()]
  }

  /** starts every enabled instance; failures show up as their state, never as a rejection */
  async startEnabled() {
    await Promise.all(this.list().filter(supervisor => supervisor.config.enabled).map(supervisor => supervisor.start()))
  }

  /** a new build of a plugin (development reload or update): running instances restart with it */
  async replacePackage(pkg: PluginPackage) {
    const affected = this.list().filter(supervisor => supervisor.config.plugin === pkg.id)
    // no instance passed: each supervisor applies its config as it is when the reload's turn comes
    await Promise.all(affected.map(supervisor => supervisor.update(undefined, pkg)))
  }

  /** deletes: stops it and unregisters its signals (and so their wires) */
  async remove(id: string) {
    const supervisor = this.supervisors.get(id)
    if (!supervisor) return false
    this.supervisors.delete(id)
    await supervisor.dispose()
    for (const { config } of supervisor.signals.list()) supervisor.signals.remove(config.id)
    return true
  }

  private assertSlugFree(instance: PluginInstanceConfig) {
    const taken = this.list().some(other => other.config.id !== instance.id && other.config.slug === instance.slug)
    if (taken) throw new Error(`slug "${instance.slug}" is already used by another plugin instance`)
  }
}
