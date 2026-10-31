import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { Capabilities } from "@lox-nexus/api"
import { SecretFields } from "../plugins/SecretFields.ts"

type SignalParams = { kind: "sensor" | "actuator"; capability: string; params?: unknown }

/**
 * Secret signal params (`writeOnly` in a capability's params) in a config export: sealed with the
 * instances' secret settings under "signal:<id>". A file from an older Nexus has none there,
 * and an older Nexus ignores these keys, since no instance has such an id.
 */
export class SignalSecrets {
  static key(signalId: string) {
    return `signal:${signalId}`
  }

  /**
   * the params apart. A capability that marks nothing secret keeps all; otherwise it fails closed
   * like settings: an unknown capability or secrets below the top level make all of them secret.
   */
  static split(description: PluginDescription | undefined, signal: SignalParams): { visible: Record<string, unknown>; secret: Record<string, unknown> } {
    const params = SignalSecrets.record(signal.params)
    const capability = Capabilities.of(description, signal)
    if (capability && !JSON.stringify(capability.params).includes('"writeOnly":true')) return { visible: params, secret: {} }
    if (!capability || !SecretFields.topLevelOnly(capability.params)) return { visible: {}, secret: params }
    const visible = new SecretFields(capability.params).strip(params)
    return { visible, secret: Object.fromEntries(Object.entries(params).filter(([key]) => !(key in visible))) }
  }

  /** the file's params with the secrets the signal had under the same id, then those of the file's sealed part */
  static restore(params: unknown, current: Record<string, unknown> | undefined, file: Record<string, unknown> | undefined): unknown {
    if (!current && !file) return params
    return { ...current, ...SignalSecrets.record(params), ...file }
  }

  private static record(value: unknown): Record<string, unknown> {
    return SecretFields.isRecord(value) ? value : {}
  }
}
