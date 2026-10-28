import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { test } from "node:test"
import { TestApp } from "../test-support/TestApp.ts"
import { BackupArchive } from "./BackupArchive.ts"
import { BackupCipher, NotABackupError, WrongPassphraseError } from "./BackupCipher.ts"

async function collect(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

async function encrypt(plain: Buffer, passphrase: string) {
  return collect(Readable.from([plain.subarray(0, 5), plain.subarray(5)]).pipe(await BackupCipher.encrypt(passphrase)))
}

test("encrypted with the passphrase; a wrong one, a changed byte or a cut file is refused", async () => {
  const plain = Buffer.from("secret configuration ".repeat(1000))
  const sealed = await encrypt(plain, "correct horse")
  assert.ok(!sealed.includes(Buffer.from("secret")), "nothing readable")
  assert.deepEqual(await collect(Readable.from([sealed]).pipe(BackupCipher.decrypt("correct horse"))), plain)
  await assert.rejects(collect(Readable.from([sealed]).pipe(BackupCipher.decrypt("wrong horse"))), WrongPassphraseError)
  const changed = Buffer.from(sealed)
  changed.writeUInt8(changed.readUInt8(100) ^ 1, 100)
  await assert.rejects(collect(Readable.from([changed]).pipe(BackupCipher.decrypt("correct horse"))), WrongPassphraseError)
  await assert.rejects(collect(Readable.from([sealed.subarray(0, 20)]).pipe(BackupCipher.decrypt("correct horse"))), NotABackupError)
  await assert.rejects(collect(Readable.from([Buffer.from("PK\x03\x04 a zip")]).pipe(BackupCipher.decrypt("correct horse"))), NotABackupError)
})

test("the archive round-trips files in small chunks, and refuses paths outside its folder", async () => {
  const dir = TestApp.tempDir()
  fs.writeFileSync(path.join(dir, "a"), "alpha")
  fs.writeFileSync(path.join(dir, "empty"), "")
  const bytes = await collect(Readable.from(BackupArchive.write([{ path: "nexus.db", file: path.join(dir, "a") }, { path: "plugins/x/1/e", file: path.join(dir, "empty") }])))
  const out = path.join(dir, "out")
  const oneByte = Readable.from([...bytes].map(b => Buffer.from([b])))
  await pipeline(oneByte, async (source: AsyncIterable<Buffer>) => {
    assert.deepEqual(await BackupArchive.extract(source, out, () => true), ["nexus.db", "plugins/x/1/e"])
  })
  assert.equal(fs.readFileSync(path.join(out, "nexus.db"), "utf8"), "alpha")
  const evil = (name: string) => Readable.from([Buffer.from(`${JSON.stringify({ path: name, size: 1 })}\nx`)])
  for (const name of ["../escape", "/etc/passwd", "plugins/../../x", "a\\b"]) {
    await assert.rejects(BackupArchive.extract(evil(name), out, () => true), /not allowed/)
  }
  await assert.rejects(BackupArchive.extract(evil("other.txt"), out, name => name === "nexus.db"), /doesn't belong/)
  await assert.rejects(BackupArchive.extract(Readable.from([Buffer.from(`${JSON.stringify({ path: "nexus.db", size: 10 })}\nshort`)]), out, () => true), /ends in the middle/)
  fs.rmSync(dir, { recursive: true })
})
