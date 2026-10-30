import assert from "node:assert/strict"
import { test } from "node:test"
import { SchemaDraft, SchemaInputError } from "./SchemaDraft.ts"
import { SchemaFields, type JsonSchemaNode } from "./SchemaField.ts"

/** what zod writes for discriminatedUnion("type", [door lock with allowUnlock, the other types]) */
const schema: JsonSchemaNode = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string", const: "door-lock", title: "Door lock" },
        name: { type: "string", title: "Name" },
        allowUnlock: { type: "boolean", default: false, title: "Allow unlocking" }
      },
      required: ["type", "name"]
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["light", "plug"], title: "Type", description: "What the apps show", enumLabels: { light: "Light" } },
        name: { type: "string", title: "Name" }
      },
      required: ["type", "name"]
    }
  ]
}

test("a discriminated union becomes a choice of its values, each with its branch's other fields", () => {
  const field = SchemaFields.parse(schema)
  assert.equal(field.kind, "union")
  assert.deepEqual([field.discriminator, field.discriminatorLabel, field.discriminatorDescription], ["type", "Type", "What the apps show"])
  assert.deepEqual(field.variants!.map(variant => [variant.value, variant.label, variant.field.fields!.map(child => child.name)]), [
    ["door-lock", "Door lock", ["name", "allowUnlock"]], ["light", "Light", ["name"]], ["plug", "plug", ["name"]]
  ])
  assert.equal(SchemaFields.parse({ oneOf: [{ type: "string" }, { type: "number" }] }).kind, "json", "other unions stay JSON")
})

test("drafts start from the stored branch, keep shared fields when the choice changes, and give back that branch's value", () => {
  const field = SchemaFields.parse(schema)
  const stored = SchemaDraft.from(field, { type: "door-lock", name: "Front", allowUnlock: true })
  assert.deepEqual(stored, { type: "door-lock", name: "Front", allowUnlock: true })
  const plug = SchemaDraft.choose(field, stored, "plug")
  assert.deepEqual(plug, { type: "plug", name: "Front" }, "the lock's switch is gone, the name stays")
  assert.deepEqual(SchemaDraft.value(field, plug), { type: "plug", name: "Front" })
  assert.deepEqual(SchemaDraft.value(field, SchemaDraft.choose(field, plug, "door-lock")), { type: "door-lock", name: "Front", allowUnlock: false })
  assert.deepEqual(SchemaDraft.from(field), { type: "door-lock", name: "", allowUnlock: false }, "nothing stored: the first choice")
  assert.throws(() => SchemaDraft.value(field, { type: "fan", name: "x" }), SchemaInputError)
})
