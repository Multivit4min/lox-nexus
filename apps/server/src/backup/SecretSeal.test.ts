import assert from "node:assert/strict"
import { test } from "node:test"
import { WrongPassphraseError } from "./BackupCipher.ts"
import { SecretSeal } from "./SecretSeal.ts"

test("sealed secrets open with their passphrase only, and nothing readable is left in the file", async () => {
  const secrets = { "inst-1": { token: "abc-secret-123" } }
  const sealed = await SecretSeal.seal(secrets, "correct horse battery")
  assert.ok(!JSON.stringify(sealed).includes("abc-secret"))
  assert.deepEqual(await SecretSeal.open(sealed, "correct horse battery"), secrets)
  await assert.rejects(SecretSeal.open(sealed, "wrong horse battery"), WrongPassphraseError)
  await assert.rejects(SecretSeal.open({ ...sealed, data: Buffer.from("x").toString("base64") }, "correct horse battery"), WrongPassphraseError)
  for (const damaged of [{ iv: "AAAA" }, { tag: "" }, { tag: Buffer.alloc(4).toString("base64") }, { salt: "AAAA" }]) {
    await assert.rejects(SecretSeal.open({ ...sealed, ...damaged }, "correct horse battery"), WrongPassphraseError, JSON.stringify(damaged))
  }
})
