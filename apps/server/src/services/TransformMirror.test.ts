import assert from "node:assert/strict"
import { test } from "node:test"
import type { SupportedTransformDto } from "@lox-nexus/api"
import type { TransformConfig } from "@lox-nexus/core"

// WireService compiles only if every TransformConfig is a TransformDto; this is the other direction
const toConfig = (step: SupportedTransformDto): TransformConfig => step

test("the API's transform type mirrors core's TransformSchema both ways (checked by the compiler)", () => {
  assert.deepEqual(toConfig({ op: "debounce", ms: 5 }), { op: "debounce", ms: 5 })
})
