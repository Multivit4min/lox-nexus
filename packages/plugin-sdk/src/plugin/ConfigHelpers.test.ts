import assert from "node:assert/strict"
import { test } from "node:test"
import { Plugin } from "./Plugin.ts"
import { PluginDescriber } from "../runtime/PluginDescriber.ts"
import { code } from "./Code.ts"
import { secret } from "./Secret.ts"
import { signalName } from "./SignalName.ts"
import { token } from "./Token.ts"
import { z } from "zod"

class ScriptLike extends Plugin<{ source: string; template: string; token: string; hookToken?: string }> {
  static readonly config = z.object({
    source: code(z.string().default("nexus.set(\"x\", 1)")),
    template: code(z.string(), "json"),
    token: secret(z.string()),
    hookToken: token(z.string().min(16).optional())
  })
}

test("code(), secret() and token() reach the described config schema", () => {
  const config = PluginDescriber.describe(ScriptLike).config as { properties: Record<string, Record<string, unknown>> }
  assert.equal(config.properties.source?.format, "code")
  assert.equal(config.properties.source?.contentMediaType, "text/javascript")
  assert.equal(config.properties.source?.default, "nexus.set(\"x\", 1)")
  assert.equal(config.properties.template?.contentMediaType, "application/json")
  assert.equal(config.properties.token?.writeOnly, true)
  assert.equal(config.properties.hookToken?.format, "token")
  assert.equal(config.properties.hookToken?.minLength, 16)
})

test("code() only takes string schemas", () => {
  // @ts-expect-error a number is never source code
  const wrong = code(z.number())
  assert.ok(wrong)
  assert.ok(code(z.string().nullable().optional()))
})

test("signalName() marks a param that names the signal", () => {
  const params = z.object({ hook: signalName(z.string().max(64)).meta({ title: "Hook name" }), pulseMs: z.number() })
  const schema = z.toJSONSchema(params) as { properties: Record<string, Record<string, unknown>> }
  assert.deepEqual([schema.properties.hook?.signalName, schema.properties.hook?.title, schema.properties.pulseMs?.signalName], [true, "Hook name", undefined])
})
