import { ConfigIssues } from "./ConfigIssues.ts"
import type { SchemaField } from "./SchemaField.ts"

/**
 * What a form edits for a field: text for strings, numbers, enums and JSON (so a half-typed
 * number stays as typed), a boolean for checkboxes, records and lists for objects and arrays,
 * null for constants.
 */
export type Draft = string | boolean | null | Draft[] | { [key: string]: Draft }

/** A field whose input can't be turned into a value; `path` is like "nested.x" or "tags[2]". */
export class SchemaInputError extends Error {
  /** @param where how the message names the field; its path when not given */
  constructor(readonly path: string, readonly reason: string, where = path) {
    super(where ? `${where}: ${reason}` : reason)
  }

  /** the same error naming the field as the form does: "Kind of light: is required", not "light: is required" */
  labelled(root: SchemaField) {
    if (!this.path) return this
    // "devices[1].name" → devices, 1, name: list positions as numbers, as zod's paths have them
    const path = this.path.split(".").flatMap(part => part.split(/\[(\d+)\]/).filter(Boolean).map(piece => /^\d+$/.test(piece) ? Number(piece) : piece))
    return new SchemaInputError(this.path, this.reason, ConfigIssues.where(root, path))
  }
}

type Result = { present: true; value: unknown } | { present: false }
const absent: Result = { present: false }

/** Converts between values (a stored config, a default) and the drafts a schema form edits. */
export class SchemaDraft {
  /**
   * The draft for a value; an undefined value starts from the field's default. Secrets always
   * start empty. A stored null of a nullable object or list stays null, so saving keeps it.
   */
  static from(field: SchemaField, value?: unknown): Draft {
    const source = value === undefined ? field.default : value
    if (source === null && field.nullable && (field.kind === "object" || field.kind === "array")) return null
    switch (field.kind) {
      case "boolean": return typeof source === "boolean" ? source : false
      case "const": return null
      case "object": {
        const record = SchemaDraft.isRecord(source) ? source : {}
        return Object.fromEntries((field.fields ?? []).map(child => [child.name, SchemaDraft.from(child, record[child.name])]))
      }
      case "array": return Array.isArray(source) ? source.map(item => SchemaDraft.from(field.items!, item)) : []
      case "union": return SchemaDraft.union(field, source)
      case "json": return source === undefined ? "" : JSON.stringify(source, null, 2)
      default:
        if (field.secret || source === undefined || source === null) return ""
        return typeof source === "object" ? JSON.stringify(source) : String(source as string | number | boolean)
    }
  }

  /**
   * The value to submit, or undefined when the field is left out: empty optional fields (so the
   * plugin's default applies) and empty secrets (the server keeps a stored secret). An empty
   * nullable field is null when it is required or has a default, which leaving it out would bring back.
   * @throws SchemaInputError for text that isn't a number, an integer, an option or JSON
   */
  static value(field: SchemaField, draft: Draft, path = ""): unknown {
    try {
      const result = SchemaDraft.convert(field, draft, path)
      return result.present ? result.value : undefined
    } catch (error) {
      throw error instanceof SchemaInputError && path === "" ? error.labelled(field) : error
    }
  }

  private static convert(field: SchemaField, draft: Draft, path: string): Result {
    if (draft === null && field.nullable) return SchemaDraft.empty(field, path)
    switch (field.kind) {
      case "boolean": return { present: true, value: draft === true }
      case "const": return field.required ? { present: true, value: field.constValue } : absent
      case "object": return SchemaDraft.object(field, draft, path)
      case "array": return SchemaDraft.array(field, draft, path)
      case "union": return SchemaDraft.unionValue(field, draft, path)
    }
    const text = typeof draft === "string" ? draft : ""
    if (text.trim() === "") return SchemaDraft.empty(field, path)
    switch (field.kind) {
      case "number": case "integer": return { present: true, value: SchemaDraft.number(field, text, path) }
      case "enum": {
        const option = field.options!.find(candidate => String(candidate) === text)
        if (option === undefined) throw new SchemaInputError(path, `"${text}" is not one of the options`)
        return { present: true, value: option }
      }
      case "json": return { present: true, value: SchemaDraft.json(text, path) }
      default: return { present: true, value: text }
    }
  }

  // an empty input: left out unless the field needs a value, or null has to override a default
  private static empty(field: SchemaField, path: string): Result {
    if (field.secret) return absent
    if (field.nullable && (field.required || field.hasDefault)) return { present: true, value: null }
    if (!field.required) return absent
    if (field.kind === "string") return { present: true, value: "" }
    throw new SchemaInputError(path, "is required")
  }

  private static number(field: SchemaField, text: string, path: string) {
    const value = Number(text)
    if (!Number.isFinite(value)) throw new SchemaInputError(path, `"${text}" is not a number`)
    if (field.kind === "integer" && !Number.isInteger(value)) throw new SchemaInputError(path, `"${text}" is not a whole number`)
    return value
  }

  private static json(text: string, path: string) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new SchemaInputError(path, "is not valid JSON")
    }
  }

  // an optional or nullable object with nothing typed in counts as empty, before its required fields complain
  private static object(field: SchemaField, draft: Draft, path: string): Result {
    const record = SchemaDraft.isRecord(draft) ? draft : {}
    if ((!field.required || field.nullable) && field.name !== "" && SchemaDraft.blank(field, record)) return SchemaDraft.empty(field, path)
    const value: Record<string, unknown> = {}
    for (const child of field.fields ?? []) {
      const result = SchemaDraft.convert(child, record[child.name] ?? SchemaDraft.from(child), SchemaDraft.join(path, child.name))
      if (result.present) value[child.name] = result.value
    }
    return { present: true, value }
  }

  // a blank item is dropped; an empty optional list is left out, unless that would bring back a non-empty default
  private static array(field: SchemaField, draft: Draft, path: string): Result {
    const items = Array.isArray(draft) ? draft : []
    const value = items
      .map((item, i) => SchemaDraft.convert({ ...field.items!, required: false }, item, `${path}[${i}]`))
      .flatMap(result => (result.present ? [result.value] : []))
    const defaultHasItems = Array.isArray(field.default) && field.default.length > 0
    if (value.length === 0 && !field.required && !defaultHasItems) return absent
    return { present: true, value }
  }

  // nothing typed in: empty texts and lists, checkboxes at their default, nested objects blank too
  private static blank(field: SchemaField, draft: Draft): boolean {
    switch (field.kind) {
      case "boolean": return draft === (field.default ?? false)
      case "const": return true
      case "array": return !Array.isArray(draft) || draft.length === 0
      case "object": {
        const record = SchemaDraft.isRecord(draft) ? draft : {}
        return (field.fields ?? []).every(child => SchemaDraft.blank(child, record[child.name] ?? SchemaDraft.from(child)))
      }
      case "union": return SchemaDraft.blank(SchemaDraft.variant(field, draft).field, draft)
      default: return typeof draft !== "string" || draft.trim() === ""
    }
  }

  /**
   * A union's draft after another choice: the discriminator as text, and the new branch's fields,
   * those with the same name as before keeping what was typed.
   */
  static choose(field: SchemaField, draft: Draft, value: string): Draft {
    const record = SchemaDraft.isRecord(draft) ? draft : {}
    const variant = field.variants!.find(candidate => String(candidate.value) === value) ?? field.variants![0]!
    const fields = (variant.field.fields ?? []).map(child => [child.name, record[child.name] ?? SchemaDraft.from(child)] as const)
    return { [field.discriminator!]: String(variant.value), ...Object.fromEntries(fields) }
  }

  /** the union's branch the draft has chosen; the first one when it names none */
  static variant(field: SchemaField, draft: Draft) {
    const chosen = SchemaDraft.isRecord(draft) ? draft[field.discriminator!] : undefined
    return field.variants!.find(candidate => String(candidate.value) === chosen) ?? field.variants![0]!
  }

  // the stored or default value's branch, else the first
  private static union(field: SchemaField, source: unknown): Draft {
    const record = SchemaDraft.isRecord(source) ? source as Record<string, unknown> : {}
    const chosen = field.variants!.find(candidate => candidate.value === record[field.discriminator!]) ?? field.variants![0]!
    const fields = SchemaDraft.from(chosen.field, record) as Record<string, Draft>
    return { [field.discriminator!]: String(chosen.value), ...fields }
  }

  private static unionValue(field: SchemaField, draft: Draft, path: string): Result {
    const record = SchemaDraft.isRecord(draft) ? draft : {}
    const chosen = field.variants!.find(candidate => String(candidate.value) === record[field.discriminator!])
    if (!chosen) throw new SchemaInputError(SchemaDraft.join(path, field.discriminator!), "choose one of the options")
    const rest = SchemaDraft.object(chosen.field, record, path)
    return { present: true, value: { [field.discriminator!]: chosen.value, ...(rest.present ? rest.value as object : {}) } }
  }

  private static join(path: string, name: string) {
    return path ? `${path}.${name}` : name
  }

  private static isRecord(value: unknown): value is Record<string, Draft> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
