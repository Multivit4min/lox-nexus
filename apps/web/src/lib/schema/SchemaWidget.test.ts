import assert from "node:assert/strict"
import { test } from "node:test"
import { SchemaFields } from "./SchemaField.ts"
import { SchemaWidgets } from "./SchemaWidget.ts"

test("the SDK's field kinds become widgets; Find is marked; plain fields stay plain", () => {
  const root = SchemaFields.parse({
    type: "object",
    properties: {
      wait: { type: "number", format: "duration", unit: "min" } as never,
      at: { type: "string", format: "time" },
      tint: { type: "string", format: "color" },
      level: { type: "number", minimum: 0, maximum: 100, widget: "slider", step: 5 } as never,
      cert: { type: "string", format: "file", maxBytes: 9, accept: ".pem" } as never,
      days: { type: "array", items: { type: "string", enum: ["mon", "tue"] } },
      url: { type: "string", discover: true } as never,
      name: { type: "string" }
    }
  })
  const widgets = Object.fromEntries(root.fields!.map(field => [field.name, field.widget]))
  assert.deepEqual(widgets, {
    wait: { kind: "duration", unit: "min" }, at: { kind: "time" }, tint: { kind: "color" }, level: { kind: "slider", step: 5 },
    cert: { kind: "file", maxBytes: 9, base64: false, accept: ".pem" }, days: { kind: "chips" }, url: undefined, name: undefined
  })
  assert.equal(root.fields!.find(field => field.name === "url")!.discover, true)
})

test("durations show in the largest unit that holds them evenly and convert both ways", () => {
  assert.equal(SchemaWidgets.unitFor(120, "s"), "min")
  assert.equal(SchemaWidgets.unitFor(7200, "s"), "h")
  assert.equal(SchemaWidgets.unitFor(90, "s"), "s")
  assert.equal(SchemaWidgets.convert(2, "min", "s"), 120)
  assert.equal(SchemaWidgets.convert(90, "s", "min"), 1.5)
})
