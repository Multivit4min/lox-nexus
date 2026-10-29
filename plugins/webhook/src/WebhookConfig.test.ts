import assert from "node:assert/strict"
import { test } from "node:test"
import { webhookConfigSchema } from "./WebhookConfig.ts"

test("tokens are optional, else 16 to 512 visible ASCII characters, so every transport can carry them", () => {
  assert.equal(webhookConfigSchema.safeParse({}).success, true)
  assert.equal(webhookConfigSchema.safeParse({ token: "a".repeat(16) }).success, true)
  assert.equal(webhookConfigSchema.safeParse({ token: "0123456789abcdef!#$%&'*+-.^_`|~" }).success, true)
  for (const token of ["a".repeat(15), "a".repeat(513), `${"a".repeat(16)} `, `${"a".repeat(16)}\n`, `${"a".repeat(16)}ä`]) {
    assert.equal(webhookConfigSchema.safeParse({ token }).success, false, JSON.stringify(token))
  }
})
