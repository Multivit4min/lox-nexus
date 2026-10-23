import assert from "node:assert/strict"
import { PassThrough } from "node:stream"
import { describe, test } from "node:test"
import { DataType } from "../DataType.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { LabCli } from "./LabCli.ts"
import { PayloadDiff } from "./PayloadDiff.ts"
import { ValueParser } from "./ValueParser.ts"

const runCli = async (...argv: string[]) => {
  const out = new PassThrough()
  const err = new PassThrough()
  let text = ""
  let errors = ""
  out.on("data", chunk => (text += chunk))
  err.on("data", chunk => (errors += chunk))
  const code = await new LabCli().run(argv, { out, err, signal: new AbortController().signal })
  return { code, text, errors }
}

describe("ici-lab", () => {
  test("decode describes a captured RGBW sequence step", async () => {
    const step = Fixtures.lines<{ hex?: string }>("2026-10-23-live/lighting-moods.jsonl")
      .find(line => line.hex?.endsWith("640906001e000040"))
    const { code, text } = await runCli("decode", step!.hex!)
    assert.equal(code, 0)
    assert.match(text, /server→claude\s+lcout\s+rgbw/)
    assert.match(text, /"flags":16384/)
  })

  test("decode flags malformed input", async () => {
    const { text } = await runCli("decode", "9e00")
    assert.match(text, /MALFORMED/)
  })

  test("unknown commands print help to stderr and fail", async () => {
    const { code, errors } = await runCli("nope")
    assert.equal(code, 1)
    assert.match(errors, /usage: npm run ici-lab/)
  })

  test("decode rejects invalid hex instead of truncating it", async () => {
    const { code, errors } = await runCli("decode", "9e0g")
    assert.equal(code, 1)
    assert.match(errors, /must be hex bytes/)
  })

  test("send validates its options before touching the network", async () => {
    const base = ["send", "--host", "127.0.0.1", "--src", "a", "--dst", "b", "--packet", "c", "--value", "1"]
    assert.match((await runCli(...base, "--port", "99999", "--type", "analog")).errors, /--port must be a port/)
    assert.match((await runCli(...base, "--port", "1", "--type", "constructor")).errors, /unknown type "constructor"/)
    assert.match((await runCli(...base, "--port", "1", "--type", "digital", "--value", "ture")).errors, /not a digital value/)
  })

  test("capture rejects a non-numeric duration", async () => {
    const { errors } = await runCli("capture", "--port", "0", "--duration", "abc")
    assert.match(errors, /--duration must be a positive number/)
  })

  test("PayloadDiff names the changed byte ranges", () => {
    const diff = new PayloadDiff()
    assert.equal(diff.next("k", Buffer.from("640d0d0002000000", "hex")), "new")
    assert.equal(diff.next("k", Buffer.from("640d0d0002000000", "hex")), "")
    assert.equal(diff.next("k", Buffer.from("640906001e000040", "hex")), "Δ 1–2: 0d0d→0906 Δ 4: 02→1e Δ 7: 00→40")
  })

  test("ValueParser handles every type", () => {
    const parser = new ValueParser()
    assert.equal(parser.parse(DataType.Digital, "on"), true)
    assert.equal(parser.parse(DataType.Analog, "2.5"), 2.5)
    assert.deepEqual(parser.parse(DataType.SmartRgbw, "{\"red\":1,\"green\":2,\"blue\":3,\"white\":4}"),
      { red: 1, green: 2, blue: 3, white: 4, fadeTime: 0.2, flags: 0 })
    assert.throws(() => parser.parse(DataType.Analog, "abc"))
  })
})
