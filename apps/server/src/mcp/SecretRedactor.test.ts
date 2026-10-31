import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginInstanceConfig, PluginSignalConfig } from "@lox-nexus/core"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"
import { SecretRedactor, type SecretSources } from "./SecretRedactor.ts"

const description: PluginDescription = {
  config: { type: "object", properties: { url: { type: "string" }, token: { type: "string", writeOnly: true } } },
  sensors: [{ id: "reading", label: "Reading", valueType: "number", params: { type: "object", properties: { entity: { type: "string" }, apiKey: { type: "string", writeOnly: true } } } }],
  actuators: []
}

function sources(overrides: Partial<SecretSources> = {}): SecretSources {
  const instances: PluginInstanceConfig[] = [{ id: "i1", plugin: "home", slug: "ha", label: "HA", enabled: true, config: { url: "http://homeassistant.local", token: "tok\"en-123456" } }]
  const signals = [{ id: "s1", kind: "sensor", capability: "reading", params: { entity: "sensor.kitchen", apiKey: "signal-key-99" }, label: "K", slug: "k" }] as PluginSignalConfig[]
  return {
    miniservers: { list: () => [{ password: "ms-password-1" }, { password: "1234" }, {}] },
    instances: { list: () => instances },
    signals: { listFor: () => signals },
    description: plugin => (plugin === "home" ? description : undefined),
    ...overrides
  }
}

test("every stored secret is replaced wherever it appears, also JSON-escaped inside a tool's text", () => {
  const redactor = new SecretRedactor(sources())
  const answer = {
    jsonrpc: "2.0",
    result: { content: [{ type: "text", text: JSON.stringify({ problem: "login failed with tok\"en-123456 at http://homeassistant.local" }) }] },
    error: { message: "ms-password-1 and signal-key-99" }
  }
  const redacted = redactor.redact(answer)
  assert.equal(redacted.result.content[0]!.text, JSON.stringify({ problem: "login failed with ‹secret› at http://homeassistant.local" }), "settings that aren't secret stay")
  assert.equal(redacted.error.message, "‹secret› and ‹secret›")
  assert.equal(answer.error.message, "ms-password-1 and signal-key-99", "the original is left alone")
})

test("short values are skipped; a plugin that isn't installed has all its settings counted", () => {
  assert.equal(new SecretRedactor(sources()).redact("PIN 1234"), "PIN 1234")
  const unknown = new SecretRedactor(sources({ description: () => undefined }))
  assert.equal(unknown.redact("at http://homeassistant.local"), "at ‹secret›")
})

test("values are read at each call, so a changed password counts at once", () => {
  let password = "first-password"
  const redactor = new SecretRedactor(sources({ miniservers: { list: () => [{ password }] }, instances: { list: () => [] } }))
  assert.equal(redactor.redact("second-password"), "second-password")
  password = "second-password"
  assert.equal(redactor.redact("second-password"), "‹secret›")
})
