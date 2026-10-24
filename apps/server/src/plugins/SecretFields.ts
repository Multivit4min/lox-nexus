import type { JsonSchema } from "@lox-nexus/plugin-sdk/wire"

/**
 * Top-level fields a plugin marked secret (`writeOnly` in its JSON Schema, see the SDK's
 * secret()). They never leave the server, and an update that omits one keeps the stored value,
 * so a UI can edit a config without knowing its password. Nested secrets are not detected.
 */
export class SecretFields {
  private readonly names: Set<string>

  constructor(schema: JsonSchema) {
    const properties = (schema.properties ?? {}) as Record<string, { writeOnly?: boolean }>
    this.names = new Set(Object.entries(properties).filter(([, field]) => field.writeOnly === true).map(([name]) => name))
  }

  /** a copy without the secret fields */
  strip(value: unknown): Record<string, unknown> {
    if (!SecretFields.isRecord(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([name]) => !this.names.has(name)))
  }

  /** names of the secret fields the value has */
  present(value: unknown): string[] {
    if (!SecretFields.isRecord(value)) return []
    return [...this.names].filter(name => value[name] !== undefined)
  }

  /** the input, with secrets it omits taken from the stored value */
  merge(input: Record<string, unknown>, stored: unknown): Record<string, unknown> {
    const kept = SecretFields.isRecord(stored) ? stored : {}
    const merged = { ...input }
    for (const name of this.names) if (!(name in merged) && name in kept) merged[name] = kept[name]
    return merged
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
