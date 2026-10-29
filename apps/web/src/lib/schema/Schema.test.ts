import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { SchemaDraft, SchemaInputError } from "./SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "./SchemaField.ts"

/** what zod's toJSONSchema (io: "input") writes for a config with every kind of field */
const schema: JsonSchemaNode = {
  type: "object",
  properties: {
    host: { type: "string", format: "uri", description: "Address of the device" },
    pollInterval: { default: 5, type: "number", minimum: 1, maximum: 60 },
    port: { default: 80, type: "integer", minimum: 1, maximum: 65535 },
    token: { type: "string", writeOnly: true },
    mode: { default: "a", type: "string", enum: ["a", "b"] },
    flag: { type: "boolean" },
    tags: { default: [], type: "array", items: { type: "string" } },
    nested: { type: "object", properties: { x: { type: "number" }, y: { type: "string" } }, required: ["x"] },
    entries: { type: "array", items: { type: "object", properties: { id: { type: "string" }, weight: { type: "number" } }, required: ["id", "weight"] } },
    maybe: { type: ["string", "null"] },
    lit: { type: "string", const: "fixed" },
    union: { type: ["string", "number"] },
    record: { type: "object", additionalProperties: { type: "string" } } as JsonSchemaNode
  },
  required: ["host", "token", "maybe", "lit"]
}
const root = SchemaFields.parse(schema)
const field = (name: string) => root.fields!.find(f => f.name === name)!

describe("SchemaFields", () => {
  test("normalizes every property: kind, label, required, secret, default, limits", () => {
    assert.deepEqual(root.fields!.map(f => [f.name, f.kind]), [
      ["host", "string"], ["pollInterval", "number"], ["port", "integer"], ["token", "string"], ["mode", "enum"], ["flag", "boolean"],
      ["tags", "array"], ["nested", "object"], ["entries", "array"], ["maybe", "string"], ["lit", "const"], ["union", "json"], ["record", "json"]
    ])
    assert.deepEqual([field("pollInterval").label, field("pollInterval").default, field("pollInterval").maximum], ["Poll interval", 5, 60])
    assert.deepEqual([field("host").required, field("host").description, field("token").secret, field("mode").options], [true, "Address of the device", true, ["a", "b"]])
    assert.deepEqual([field("maybe").nullable, field("maybe").required, field("flag").required], [true, true, false])
    assert.deepEqual(field("entries").items!.fields!.map(f => [f.name, f.kind, f.required]), [["id", "string", true], ["weight", "number", true]])
  })

  test("nullable via anyOf and humanized names", () => {
    const parsed = SchemaFields.parse({ anyOf: [{ type: "integer" }, { type: "null" }], description: "d" }, "api_key")
    assert.deepEqual([parsed.kind, parsed.nullable, parsed.description, parsed.label], ["integer", true, "d", "API key"])
    assert.deepEqual(["entityId", "url", "idleTime", "pollInterval"].map(name => SchemaFields.humanize(name)), ["Entity ID", "URL", "Idle time", "Poll interval"])
  })
})

describe("SchemaDraft", () => {
  test("a new form starts from the defaults; secrets and unset fields start empty", () => {
    const draft = SchemaDraft.from(root) as Record<string, unknown>
    assert.deepEqual([draft.host, draft.pollInterval, draft.port, draft.token, draft.mode, draft.flag, draft.tags], ["", "5", "80", "", "a", false, []])
    assert.deepEqual(draft.nested, { x: "", y: "" })
  })

  test("a stored config round-trips, except the secret, which is left out so the server keeps it", () => {
    const stored = {
      host: "http://x", pollInterval: 2.5, port: 81, token: "s3cret", mode: "b", flag: true, tags: ["a", "b"],
      nested: { x: 1 }, entries: [{ id: "e", weight: 2 }], maybe: "m", lit: "fixed", union: 3, record: { a: "b" }
    }
    const expected: Partial<typeof stored> = { ...stored }
    delete expected.token
    assert.deepEqual(SchemaDraft.value(root, SchemaDraft.from(root, stored)), expected)
  })

  test("empty optional fields are left out, an empty nullable required field is null, blank list items are dropped", () => {
    const draft = SchemaDraft.from(root) as Record<string, unknown>
    draft.host = "http://x"
    draft.tags = ["one", "  ", "two"]
    assert.deepEqual(SchemaDraft.value(root, draft as never), { host: "http://x", pollInterval: 5, port: 80, mode: "a", flag: false, tags: ["one", "two"], maybe: null, lit: "fixed" })
  })

  test("text that isn't a number, a whole number, an option or JSON names its field", () => {
    const cases: Array<[string, unknown, RegExp]> = [
      ["pollInterval", "abc", /^pollInterval: "abc" is not a number$/],
      ["port", "1.5", /^port: "1.5" is not a whole number$/],
      ["mode", "c", /^mode: "c" is not one of the options$/],
      ["union", "{", /^union: is not valid JSON$/],
      ["nested", { x: "", y: "set" }, /^nested\.x: is required$/]
    ]
    for (const [name, value, message] of cases) {
      const draft = { ...(SchemaDraft.from(root) as Record<string, unknown>), host: "h", [name]: value }
      assert.throws(() => SchemaDraft.value(root, draft as never), (error: unknown) => error instanceof SchemaInputError && message.test(error.message))
    }
  })

  test("stored nulls survive a save, and an explicit null or empty list isn't turned back into the default", () => {
    const nulls = SchemaFields.parse({
      type: "object",
      properties: {
        obj: { anyOf: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "null" }] },
        n: { default: 5, type: ["number", "null"] },
        list: { default: ["x"], type: "array", items: { type: "string" } },
        plain: { default: 3, type: "number" }
      },
      required: ["obj"]
    })
    const stored = { obj: null, n: null, list: [] }
    assert.deepEqual(SchemaDraft.value(nulls, SchemaDraft.from(nulls, stored)), { obj: null, n: null, list: [], plain: 3 })
    const typed = { ...(SchemaDraft.from(nulls, stored) as Record<string, unknown>), obj: { a: "set" }, plain: "" }
    assert.deepEqual(SchemaDraft.value(nulls, typed as never), { obj: { a: "set" }, n: null, list: [] }, "an emptied non-nullable field goes back to its default")
  })

  test("strings marked as code get their language; other formats stay plain strings", () => {
    const fields = SchemaFields.parse({
      type: "object",
      properties: {
        script: { type: "string", format: "code", contentMediaType: "text/javascript", default: "nexus.set(\"x\", 1)" },
        template: { type: "string", format: "code", contentMediaType: "application/json" },
        notes: { type: "string", format: "code", contentMediaType: "text/x-unknown" },
        host: { type: "string", format: "uri" }
      }
    }).fields!
    assert.deepEqual(fields.map(f => [f.name, f.kind, f.code]), [["script", "string", "javascript"], ["template", "string", "json"], ["notes", "string", "text"], ["host", "string", undefined]])
    assert.equal(SchemaDraft.value(fields[0]!, "let a = 1\n"), "let a = 1\n")
  })

  test("strings marked as tokens get a generate button; a token value is kept as typed", () => {
    const fields = SchemaFields.parse({ type: "object", properties: { token: { type: "string", format: "token" }, host: { type: "string" } } }).fields!
    assert.deepEqual(fields.map(f => [f.name, f.token]), [["token", true], ["host", undefined]])
    assert.equal(SchemaDraft.value(fields[0]!, "abc"), "abc")
  })

  test("the param marked with signalName is known", () => {
    const fields = SchemaFields.parse({ type: "object", properties: { hook: { type: "string", signalName: true }, pulseMs: { type: "number" } } }).fields!
    assert.deepEqual(fields.map(f => [f.name, f.signalName]), [["hook", true], ["pulseMs", undefined]])
  })

  test("enum values can have names (enumLabels)", () => {
    const parsed = SchemaFields.parse({ type: "string", enum: ["unix", "minutesUntil"], default: "unix", enumLabels: { minutesUntil: "Minutes until" } }, "format")
    assert.deepEqual([parsed.options, parsed.optionLabels], [["unix", "minutesUntil"], { minutesUntil: "Minutes until" }])
  })
})
