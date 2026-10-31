import type { PluginInstanceConfig, PluginSignalConfig } from "@lox-nexus/core"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import type { Persistence } from "../db/Persistence.ts"
import type { PluginCatalog } from "../plugins/PluginCatalog.ts"
import { SecretFields } from "../plugins/SecretFields.ts"
import { SignalSecrets } from "../services/SignalSecrets.ts"

/** where the stored secret values are; the repositories, which hold them in plain text */
export interface SecretSources {
  miniservers: { list(): Array<{ password?: string | undefined }> }
  instances: { list(): PluginInstanceConfig[] }
  signals: { listFor(instanceId: string): PluginSignalConfig[] }
  /** undefined for a plugin that isn't installed: then all its settings count as secret */
  description(plugin: string): PluginDescription | undefined
}

/**
 * A safety net for text a plugin or device controls (status messages, last errors, and from A3
 * panels, logs and action answers): replaces every stored secret value in an MCP answer with
 * ‹secret›, whatever tool or resource produced it. Fields Nexus knows are secret are left out of
 * answers anyway; this catches a secret a plugin wrote into free text, such as a URL with a
 * password in an error. Short values are skipped, since "1234" would blank unrelated numbers.
 */
export class SecretRedactor {
  static readonly MIN_LENGTH = 6
  static readonly MARK = "‹secret›"

  constructor(private readonly sources: SecretSources) {}

  /** from the app's repositories and installed plugins */
  static of(db: Pick<Persistence, "miniservers" | "pluginInstances" | "pluginSignals">, catalog: Pick<PluginCatalog, "get">) {
    return new SecretRedactor({
      miniservers: db.miniservers, instances: db.pluginInstances, signals: db.pluginSignals,
      description: plugin => catalog.get(plugin)?.pkg.description
    })
  }

  /** a copy with every string redacted; read fresh each time, so a changed password counts at once */
  redact<T>(value: T): T {
    const forms = this.forms()
    return forms.length ? SecretRedactor.walk(value, forms) as T : value
  }

  /** the stored secret values in the forms they tend to appear in, longest first */
  private forms() {
    const values = new Set<string>()
    for (const { password } of this.sources.miniservers.list()) if (password) values.add(password)
    for (const instance of this.sources.instances.list()) {
      const description = this.sources.description(instance.plugin)
      SecretRedactor.collect(SecretRedactor.secretSettings(instance.config, description), values)
      for (const signal of this.sources.signals.listFor(instance.id)) SecretRedactor.collect(SignalSecrets.split(description, signal).secret, values)
    }
    const forms = [...values].filter(value => value.length >= SecretRedactor.MIN_LENGTH).flatMap(SecretRedactor.encodings)
    return [...new Set(forms)].sort((a, b) => b.length - a.length)
  }

  // as plugins tend to write a secret: raw, JSON-escaped (tool texts are JSON in a string), in a
  // URL (percent-encoded), or as base64 (Basic auth); a base64 form is only caught whole
  private static encodings(value: string) {
    const base64 = Buffer.from(value).toString("base64")
    return [value, JSON.stringify(value).slice(1, -1), encodeURIComponent(value), base64, base64.replace(/=+$/, ""), Buffer.from(value).toString("base64url")]
  }

  // fails closed like the export: without the plugin, or with secrets below the top level, every setting counts
  private static secretSettings(config: unknown, description: PluginDescription | undefined) {
    const record = typeof config === "object" && config !== null ? config as Record<string, unknown> : {}
    if (!description || !SecretFields.topLevelOnly(description.config)) return record
    const visible = new SecretFields(description.config).strip(record)
    return Object.fromEntries(Object.entries(record).filter(([key]) => !(key in visible)))
  }

  private static collect(value: unknown, into: Set<string>) {
    if (typeof value === "string") into.add(value)
    else if (typeof value === "number") into.add(String(value))
    else if (Array.isArray(value)) for (const item of value) SecretRedactor.collect(item, into)
    else if (typeof value === "object" && value !== null) for (const item of Object.values(value)) SecretRedactor.collect(item, into)
  }

  private static walk(value: unknown, forms: readonly string[]): unknown {
    if (typeof value === "string") return forms.reduce((text, form) => text.includes(form) ? text.split(form).join(SecretRedactor.MARK) : text, value)
    if (Array.isArray(value)) return value.map(item => SecretRedactor.walk(item, forms))
    if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SecretRedactor.walk(item, forms)]))
    return value
  }
}
