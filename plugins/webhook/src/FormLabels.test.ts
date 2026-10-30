import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { WebhookPlugin } from "./WebhookPlugin.ts"

type Field = { title?: string; description?: string; writeOnly?: boolean; format?: string; enumLabels?: Record<string, string> }
type Schema = { properties?: Record<string, Field> }

/** field key → title, for a JSON Schema object */
function titles(schema: unknown) {
  const properties = (schema as Schema).properties ?? {}
  return Object.fromEntries(Object.entries(properties).map(([key, field]) => [key, field.title]))
}

test("every form field has a title and a description, and every choice a label", async () => {
  const description = await PluginTestHost.describe(WebhookPlugin)
  const token = (description.config as Schema).properties?.token
  assert.equal(token?.title, "Token")
  assert.equal(token?.writeOnly, true, "hidden in the form; the panel shows it for copying")
  assert.equal(token?.format, "token", "the form offers to generate one")
  const [trigger, ...values] = description.sensors
  assert.deepEqual(titles(trigger?.params), { hook: "Hook name", method: "HTTP method", pulseMs: "Pulse length (ms)" })
  assert.equal(values.length, 3)
  for (const sensor of values) {
    assert.deepEqual(titles(sensor.params), { hook: "Hook name", method: "HTTP method", source: "Value from", path: "JSON path", name: "Field name" }, sensor.id)
    const fields = (sensor.params as Schema).properties ?? {}
    assert.deepEqual(fields.source?.enumLabels, { json: "JSON body", query: "Query parameter", form: "Form field", body: "Whole body" })
    assert.equal(fields.method?.enumLabels?.any, "Any method")
    for (const [key, field] of Object.entries(fields)) assert.ok(field.description, `${sensor.id}.${key} has a description`)
  }
})
