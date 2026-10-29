/** A JSON Schema node as zod's toJSONSchema writes it; only the keywords the form uses are typed. */
export interface JsonSchemaNode {
  type?: string | string[]
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  /** names for enum values, by value: not JSON Schema, set by plugins with `.meta({ enumLabels })` */
  enumLabels?: Record<string, string>
  const?: unknown
  writeOnly?: boolean
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  items?: JsonSchemaNode | JsonSchemaNode[]
  anyOf?: JsonSchemaNode[]
  minimum?: number
  maximum?: number
  format?: string
  contentMediaType?: string
}

/** json: anything the form has no input for (records, unions, tuples), edited as JSON text */
export type FieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "const" | "object" | "array" | "json"

/** One input of a schema form, normalized from its JSON Schema. */
export interface SchemaField {
  /** the property name; "" for the root and for array items */
  name: string
  label: string
  description?: string
  kind: FieldKind
  required: boolean
  /** null is allowed besides the kind */
  nullable: boolean
  /** marked secret in the plugin (`writeOnly`): never shown, kept when left empty */
  secret: boolean
  hasDefault: boolean
  default?: unknown
  /** enum: the allowed values */
  options?: Array<string | number | boolean>
  /** enum: what to show for a value; values without one are shown as they are */
  optionLabels?: Record<string, string>
  /** const: the only allowed value */
  constValue?: unknown
  minimum?: number
  maximum?: number
  format?: string
  /** string marked as source code by the plugin (`code()` in the SDK): edited in a code editor */
  code?: CodeLanguage
  /** string marked as a random token (`token()` in the SDK): the input has a button that generates one */
  token?: true
  /** object: its properties, in schema order */
  fields?: SchemaField[]
  /** array: the item */
  items?: SchemaField
}

/** The languages a code field can be shown as; unknown media types are plain text. */
export type CodeLanguage = "javascript" | "json" | "text"

/** Turns a JSON Schema into the field tree a SchemaForm renders. Unknown shapes fall back to "json". */
export class SchemaFields {
  private static readonly CODE_LANGUAGES: Record<string, CodeLanguage> = {
    "text/javascript": "javascript",
    "application/javascript": "javascript",
    "application/json": "json",
    "text/plain": "text"
  }

  static parse(schema: JsonSchemaNode, name = "", required = true): SchemaField {
    const { node, nullable } = SchemaFields.unwrapNull(schema)
    const field: SchemaField = {
      name, label: node.title ?? schema.title ?? SchemaFields.humanize(name), kind: SchemaFields.kindOf(node), required, nullable,
      secret: node.writeOnly === true || schema.writeOnly === true, hasDefault: "default" in schema || "default" in node
    }
    const description = node.description ?? schema.description
    if (description) field.description = description
    if (field.hasDefault) field.default = "default" in schema ? schema.default : node.default
    for (const key of ["minimum", "maximum", "format"] as const) if (node[key] !== undefined) Object.assign(field, { [key]: node[key] })
    if (field.kind === "string" && node.format === "code") field.code = SchemaFields.CODE_LANGUAGES[node.contentMediaType ?? ""] ?? "text"
    if (field.kind === "string" && node.format === "token") field.token = true
    if (field.kind === "enum") field.options = node.enum!.filter(SchemaFields.isPrimitive)
    const labels = node.enumLabels ?? schema.enumLabels
    if (field.kind === "enum" && labels && typeof labels === "object") field.optionLabels = labels
    if (field.kind === "const") field.constValue = node.const
    if (field.kind === "object") {
      const needed = new Set(node.required ?? [])
      field.fields = Object.entries(node.properties ?? {}).map(([key, child]) => SchemaFields.parse(child, key, needed.has(key)))
    }
    if (field.kind === "array") field.items = SchemaFields.parse(node.items as JsonSchemaNode, "", true)
    return field
  }

  /** "pollInterval" → "Poll interval", "api_key" → "API key", "entityId" → "Entity ID" */
  static humanize(name: string) {
    const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase()
      .split(" ").map(word => (SchemaFields.ACRONYMS.has(word) ? word.toUpperCase() : word)).join(" ")
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  private static readonly ACRONYMS = new Set(["api", "id", "ip", "url", "uri", "http", "https", "mqtt", "tls", "ssl", "ics"])

  // `T | null` comes as a type list or as anyOf with a null branch
  private static unwrapNull(schema: JsonSchemaNode): { node: JsonSchemaNode; nullable: boolean } {
    if (Array.isArray(schema.type) && schema.type.includes("null")) {
      const rest = schema.type.filter(type => type !== "null")
      return { node: { ...schema, type: rest.length === 1 ? rest[0] : rest }, nullable: true }
    }
    const branches = schema.anyOf
    if (branches?.length === 2 && branches.some(branch => branch.type === "null")) {
      const branch = branches.find(candidate => candidate.type !== "null")!
      return { node: { ...branch, description: schema.description ?? branch.description }, nullable: true }
    }
    return { node: schema, nullable: false }
  }

  private static kindOf(node: JsonSchemaNode): FieldKind {
    if (node.const !== undefined) return "const"
    if (Array.isArray(node.enum) && node.enum.every(SchemaFields.isPrimitive)) return "enum"
    switch (node.type) {
      case "string": case "number": case "integer": case "boolean": return node.type
      case "object": return node.properties ? "object" : "json"
      case "array": return node.items && !Array.isArray(node.items) && SchemaFields.kindOf(node.items) !== "json" ? "array" : "json"
      default: return "json"
    }
  }

  private static isPrimitive(value: unknown): value is string | number | boolean {
    return ["string", "number", "boolean"].includes(typeof value)
  }
}
