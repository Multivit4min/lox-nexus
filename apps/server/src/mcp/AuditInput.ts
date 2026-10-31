/**
 * An agent's arguments as the audit keeps them. Secrets are refused by the tools, but only after
 * the call was parsed, so a refused call still carries the secret an agent typed: every field
 * named like a secret setting or param of an installed plugin (and "password") is masked, wherever
 * it sits. That masks a few harmless fields too, which is the safe side.
 */
export class AuditInput {
  static readonly MAX = 2000
  static readonly MASK = "‹secret›"

  constructor(private readonly secretNames: () => ReadonlySet<string>) {}

  text(input: unknown) {
    const names = this.secretNames()
    const text = JSON.stringify(AuditInput.masked(input, names)) ?? "null"
    return text.length <= AuditInput.MAX ? text : `${text.slice(0, AuditInput.MAX)}…`
  }

  /** the names of fields marked writeOnly anywhere in these JSON Schemas */
  static secretFields(schemas: readonly unknown[]): Set<string> {
    const names = new Set(["password"])
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (typeof node !== "object" || node === null) return
      const properties = (node as { properties?: unknown }).properties
      if (typeof properties === "object" && properties !== null) {
        for (const [name, field] of Object.entries(properties)) if ((field as { writeOnly?: unknown })?.writeOnly === true) names.add(name)
      }
      Object.values(node).forEach(walk)
    }
    walk(schemas)
    return names
  }

  private static masked(value: unknown, names: ReadonlySet<string>): unknown {
    if (Array.isArray(value)) return value.map(item => AuditInput.masked(item, names))
    if (typeof value !== "object" || value === null) return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, names.has(key) ? AuditInput.MASK : AuditInput.masked(item, names)]))
  }
}
