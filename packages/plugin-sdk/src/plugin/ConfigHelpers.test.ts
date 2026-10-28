import assert from "node:assert/strict"
import { test } from "node:test"
import { Plugin } from "./Plugin.ts"
import { PluginDescriber } from "../runtime/PluginDescriber.ts"
import { code } from "./Code.ts"
import { secret } from "./Secret.ts"
import { z } from "zod"

class ScriptLike extends Plugin<{ source: string; template: string; token: string }> {
  static readonly config = z.object({
    source: code(z.string().default("nexus.set(\"x\", 1)")),
    template: code(z.string(), "json"),
    token: secret(z.string())
  })
}

test("code() and secret() reach the described config schema", () => {
  const config = PluginDescriber.describe(ScriptLike).config as { properties: Record<string, Record<string, unknown>> }
  assert.equal(config.properties.source?.format, "code")
  assert.equal(config.properties.source?.contentMediaType, "text/javascript")
  assert.equal(config.properties.source?.default, "nexus.set(\"x\", 1)")
  assert.equal(config.properties.template?.contentMediaType, "application/json")
  assert.equal(config.properties.token?.writeOnly, true)
})

test("code() only takes string schemas", () => {
  // @ts-expect-error a number is never source code
  const wrong = code(z.number())
  assert.ok(wrong)
  assert.ok(code(z.string().nullable().optional()))
})
