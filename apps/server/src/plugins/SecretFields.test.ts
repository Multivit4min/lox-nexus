import assert from "node:assert/strict"
import { test } from "node:test"
import { secret, z } from "@lox-nexus/plugin-sdk"
import { PluginTestHost } from "@lox-nexus/plugin-sdk/testing"
import { Plugin } from "@lox-nexus/plugin-sdk"
import { SecretFields } from "./SecretFields.ts"

class TokenPlugin extends Plugin {
  static readonly config = z.object({ host: z.string(), token: secret(z.string()) })
}

test("secret fields are stripped and kept when an update omits them", async () => {
  const fields = new SecretFields((await PluginTestHost.describe(TokenPlugin)).config)
  const stored = { host: "a", token: "s3cret" }
  assert.deepEqual(fields.strip(stored), { host: "a" })
  assert.deepEqual(fields.merge({ host: "b" }, stored), { host: "b", token: "s3cret" })
  assert.deepEqual(fields.merge({ host: "b", token: "new" }, stored), { host: "b", token: "new" })
  assert.deepEqual(fields.strip("not an object"), {})
})

test("present names the secret fields that have a value, never their values", async () => {
  const fields = new SecretFields((await PluginTestHost.describe(TokenPlugin)).config)
  assert.deepEqual(fields.present({ host: "a", token: "s3cret" }), ["token"])
  assert.deepEqual(fields.present({ host: "a" }), [])
  assert.deepEqual(fields.present(null), [])
})

class RenamedTokenPlugin extends Plugin {
  static readonly config = z.object({ host: z.string(), apiToken: secret(z.string()) })
}

class RecordPlugin extends Plugin {
  static readonly config = z.record(z.string(), z.string())
}

test("after an update renamed a secret field, the old value is hidden and kept for a rollback", async () => {
  const fields = new SecretFields((await PluginTestHost.describe(RenamedTokenPlugin)).config)
  const stored = { host: "a", token: "old secret", apiToken: "new secret" }
  assert.deepEqual(fields.strip(stored), { host: "a" })
  assert.deepEqual(fields.merge({ host: "b" }, stored), { host: "b", token: "old secret", apiToken: "new secret" })
  // an open schema (a record) declares nothing, so only marked secrets are hidden
  assert.deepEqual(new SecretFields((await PluginTestHost.describe(RecordPlugin)).config).strip({ any: "x" }), { any: "x" })
})
