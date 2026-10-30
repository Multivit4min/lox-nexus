import assert from "node:assert/strict"
import { test } from "node:test"
import { ConfigIssues } from "./ConfigIssues.ts"
import { SchemaFields, type JsonSchemaNode } from "./SchemaField.ts"

const root = SchemaFields.parse({
  type: "object",
  properties: {
    host: { type: "string", title: "Host" },
    devices: { type: "array", title: "Devices", items: { type: "object", properties: { name: { type: "string", title: "Name" } } } }
  }
} as JsonSchemaNode)

test("issues name the field by its title, list entries counted from 1, under a save's config prefix", () => {
  assert.deepEqual(ConfigIssues.describe(root, [
    { path: ["config", "host"], message: "required" },
    { path: ["devices", 1, "name"], message: "too long" },
    { path: [], message: "invalid" }
  ], "config"), ["Host: required", "Devices › 2 › Name: too long", "invalid"])
})
