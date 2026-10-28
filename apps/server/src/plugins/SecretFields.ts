import type { JsonSchema } from "@lox-nexus/plugin-sdk/wire"

/**
 * Top-level fields a plugin marked secret (`writeOnly` in its JSON Schema, see the SDK's
 * secret()). They never leave the server, and an update that omits one keeps the stored value,
 * so a UI can edit a config without knowing its password. Nested secrets are not detected.
 *
 * Fields the schema doesn't declare are treated like secrets: after an update that renamed or
 * dropped a secret field, its stored value is no longer marked, but it must not be shown either.
 * They are kept on save, so a rollback to the version that knows them finds them again.
 */
export class SecretFields {
  private readonly names: Set<string>
  /** the declared fields of an object schema; undefined when it allows any field (a record) */
  private readonly declared: Set<string> | undefined

  constructor(schema: JsonSchema) {
    const properties = (schema.properties ?? {}) as Record<string, { writeOnly?: boolean }>
    this.names = new Set(Object.entries(properties).filter(([, field]) => field.writeOnly === true).map(([name]) => name))
    // zod describes configs for input, without additionalProperties: false; records and loose objects have a schema there
    const open = schema.additionalProperties !== undefined && schema.additionalProperties !== false
    this.declared = schema.properties && !open ? new Set(Object.keys(properties)) : undefined
  }

  /** a copy without the secret fields and the undeclared ones */
  strip(value: unknown): Record<string, unknown> {
    if (!SecretFields.isRecord(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([name]) => !this.hidden(name)))
  }

  /** names of the secret fields the value has */
  present(value: unknown): string[] {
    if (!SecretFields.isRecord(value)) return []
    return [...this.names].filter(name => value[name] !== undefined)
  }

  /** the input, with hidden fields (secrets, undeclared) it omits taken from the stored value */
  merge(input: Record<string, unknown>, stored: unknown): Record<string, unknown> {
    const kept = SecretFields.isRecord(stored) ? stored : {}
    const merged = { ...input }
    for (const [name, value] of Object.entries(kept)) if (!(name in merged) && this.hidden(name)) merged[name] = value
    return merged
  }

  private hidden(name: string) {
    return this.names.has(name) || (this.declared !== undefined && !this.declared.has(name))
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
