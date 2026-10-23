import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import type { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { IciCipher } from "./IciCipher.ts"

/**
 * Real 0x9F packets from the test Miniserver. The envelope is checked always; decryption needs the
 * remote system's password, which isn't stored in the repo: set ICI_FIXTURE_PASSWORD to run it.
 */
const packets = Fixtures.datagrams("2026-10-23-live/encrypted-analog.jsonl").map(buffer => {
  const result = new PacketDecoder().decode(buffer)
  assert.equal(result.kind, "encrypted")
  return (result as { packet: EncryptedPacket }).packet
})
const password = process.env.ICI_FIXTURE_PASSWORD

describe("encrypted packets captured from the test Miniserver", () => {
  test("envelope: server → encrypte, 3 blocks (IV + 2), 75 bytes, like the document's analog example", () => {
    assert.equal(packets.length, 40)
    assert.ok(packets.every(p => p.sourceId === "server" && p.targetId === "encrypte" && p.blockCount === 3 && p.raw?.length === 75))
  })

  test("decrypted: analog values 0–100, constant magic and kind, sequence +1 per packet under a mask", { skip: password ? false : "set ICI_FIXTURE_PASSWORD" }, () => {
    const cipher = new IciCipher(password!)
    const opened = packets.map(packet => cipher.open(packet))
    const data = opened.map(o => (o.kind === "data" ? o : assert.fail("expected data")))
    assert.ok(data.every(d => d.packet.packetId === "analog" && d.packet.dataType === 1))
    assert.ok(data.every(d => typeof d.packet.value() === "number" && (d.packet.value() as number) >= 0 && (d.packet.value() as number) <= 100))
    assert.equal(new Set(data.map(d => `${d.iv.magic.toString("hex")}/${d.iv.kind}`)).size, 1)
    // unmasking with sequence[0] XOR start: low 7 bits of the start are 0x0c (see PROTOCOL.md)
    const first = data[0]!.iv.sequence
    assert.ok(data.every((d, i) => ((d.iv.sequence ^ first ^ 0x0c) >>> 0) === 0x0c + i))
  })
})
