import {
  PluginCheckInputSchema, PluginDiscoverInputSchema, type PluginCheckDto, type PluginCheckInput, type PluginDiscoverInput, type PluginDiscoverResultDto
} from "@lox-nexus/api"
import { PluginUnavailableError, type ConfigCheck, type PluginConfigChecker, type PluginInstanceConfig, type PluginStateStore } from "@lox-nexus/core"
import { z } from "zod"
import { HttpError } from "../http/HttpError.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { SecretFields } from "../plugins/SecretFields.ts"

/** A config to save, and for an edit that migrated, what the migration writes to the instance's store. */
export type PreparedConfig = Pick<PluginInstanceConfig, "config" | "configVersion"> & { storeWrites?: ConfigCheck["store"] }

/**
 * Settings checked by the plugin itself before they are saved, in a throwaway worker: zod issues
 * keep their field paths, an older config is migrated, and Test connection runs. A plugin built
 * before checks existed is saved as before and checks its config when it starts.
 */
export class PluginSettingsCheck {
  constructor(
    private readonly checker: Pick<PluginConfigChecker, "check" | "test" | "discover">,
    private readonly available: Pick<PluginCatalog, "get">,
    private readonly stored: (id: string) => PluginInstanceConfig | undefined,
    /** an instance's store, for a migration an edit runs before its first start */
    private readonly store?: PluginStateStore
  ) {}

  /**
   * The config to save, with the plugin's config version. The form sends the current shape, so
   * that is what is checked. An edit of an instance stored with an older version also runs the
   * migration, on a copy of its store: `storeWrites` is what it wrote there (the Matter bridge
   * moves its old device list), for the caller to apply once the instance is saved. A plugin that
   * doesn't load at all is saved unchecked, as before checks existed; its start then says why.
   * @param stored the edited instance
   * @throws ZodError 400 with the issues under `config`; HttpError 400 for an unavailable plugin, 502 when the check failed
   */
  async prepare(plugin: string, config: unknown, stored?: PluginInstanceConfig): Promise<PreparedConfig> {
    const pkg = this.package(plugin)
    const unchecked = { config, ...(stored?.configVersion === undefined ? {} : { configVersion: stored.configVersion }) }
    const result = await PluginSettingsCheck.guard(() => this.checker.check(pkg, config), true)
    if (!result) return unchecked
    if (result.issues.length > 0) {
      throw new z.ZodError(result.issues.map(issue => ({ code: "custom" as const, path: ["config", ...issue.path], message: issue.message, input: undefined })))
    }
    const prepared = { config: result.config, configVersion: result.version }
    if (!stored || (stored.configVersion ?? 1) >= result.version || !this.store) return prepared
    const migration = await PluginSettingsCheck.guard(() => this.checker.check(pkg, stored.config, stored.configVersion ?? 1, this.store!.load(stored.id)))
    return { ...prepared, ...(migration?.store ? { storeWrites: migration.store } : {}) }
  }

  /** applies an edit's migration writes to the instance's store, after the instance was saved */
  applyStore(instanceId: string, writes: PreparedConfig["storeWrites"]) {
    for (const [key, value] of Object.entries(writes?.set ?? {})) this.store?.set(instanceId, key, value)
    for (const key of writes?.delete ?? []) this.store?.delete(instanceId, key)
  }

  /** for the settings form: issues, and with `test` the connection test's outcome */
  async check(input: PluginCheckInput): Promise<PluginCheckDto> {
    const parsed = PluginCheckInputSchema.parse(input)
    const pkg = this.package(parsed.plugin)
    const previous = parsed.instanceId ? this.stored(parsed.instanceId) : undefined
    if (parsed.instanceId && previous?.plugin !== parsed.plugin) throw HttpError.notFound(`plugin instance "${parsed.instanceId}"`)
    const config = previous ? new SecretFields(pkg.description.config).merge(parsed.config, previous.config) : parsed.config
    const result = await PluginSettingsCheck.guard(() => this.checker.check(pkg, config))
    if (!result) return { checked: false, issues: [] }
    if (!parsed.test || result.issues.length > 0) return { checked: true, issues: result.issues }
    try {
      const message = await this.checker.test(pkg, result.config)
      return { checked: true, issues: [], test: { ok: true, ...(message ? { message } : {}) } }
    } catch (error) {
      return { checked: true, issues: [], test: { ok: false, error: error instanceof Error ? error.message : String(error) } }
    }
  }

  /**
   * Find on the network for a config field the plugin marked discoverable, in a throwaway worker.
   * @throws HttpError 400 unknown plugin, 404 a field without Find, 502 the plugin failed
   */
  async discover(plugin: string, input: PluginDiscoverInput): Promise<PluginDiscoverResultDto> {
    const { field, config } = PluginDiscoverInputSchema.parse(input)
    const pkg = this.package(plugin)
    if (!pkg.description.discoverable?.includes(field)) throw HttpError.notFound(`Find on the network for "${field}"`)
    try {
      return { found: await this.checker.discover(pkg, field, config) }
    } catch (error) {
      throw new HttpError(502, `the plugin couldn't search: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // the plugin failing to check (it doesn't load, its migration throws, it answers nonsense) is a
  // failing upstream; one that doesn't load at all may be left unchecked
  private static async guard<T>(work: () => Promise<T>, uncheckedIfUnavailable = false): Promise<T | undefined> {
    try {
      return await work()
    } catch (error) {
      if (uncheckedIfUnavailable && error instanceof PluginUnavailableError) return undefined
      throw new HttpError(502, `the plugin couldn't check the settings: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private package(plugin: string) {
    const entry = this.available.get(plugin)
    if (!entry) throw HttpError.badRequest(`plugin "${plugin}" is not available`)
    return entry.pkg
  }
}
