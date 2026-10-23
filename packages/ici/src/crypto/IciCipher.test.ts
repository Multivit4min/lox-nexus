import assert from "node:assert/strict"
import { createDecipheriv, createHash } from "node:crypto"
import { describe, test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { PacketEncoder } from "../codec/PacketEncoder.ts"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import type { EncryptedPacket } from "../packet/EncryptedPacket.ts"
import { IciCipher } from "./IciCipher.ts"
import { IvBlock, IvKind } from "./IvBlock.ts"
import { IvSequence } from "./IvSequence.ts"

const address = { sourceId: "server", targetId: "encrypte" }
const encoder = new PacketEncoder()
const key = (password: string) => createHash("sha256").update(password).digest().subarray(0, 16)
const decryptRaw = (password: string, sealed: EncryptedPacket) => {
  const ecb = createDecipheriv("aes-128-ecb", key(password), null).setAutoPadding(false)
  const cbc = createDecipheriv("aes-128-cbc", key(password), sealed.iv).setAutoPadding(false)
  return {
    ivInner: Buffer.concat([ecb.update(sealed.iv), ecb.final()]).toString("hex"),
    body: Buffer.concat([cbc.update(sealed.ciphertext), cbc.final()]).toString("hex")
  }
}
const iv = (hex: string) => IvBlock.parse(Buffer.from(hex.replace(/ /g, ""), "hex"))!

// the three worked examples of the reverse-engineering document (PROTOCOL.md, 0x9F)
const examples = [
  { name: "analog CC1 = 42.0", packet: DataPacket.of({ ...address, packetId: "CC1" }, DataType.Analog, 42), iv: "4c01e2c5 2a 1062eec331b1ae b0 730a08", body: "434331000000000000 0800 0000000000004540", size: 75 },
  { name: "digital CC2 = on", packet: DataPacket.of({ ...address, packetId: "CC2" }, DataType.Digital, true), iv: "4c01e2c5 2b 784e42399ba3f9 cc 680a08", body: "434332000000000000 0100 01", size: 59 },
  { name: "text CC3 = TEST1", packet: DataPacket.of({ ...address, packetId: "CC3" }, DataType.Text, "TEST1"), iv: "4c01e2c5 29 7e7e7e6c015318 c7 680a08", body: "434333000000000000 0600 544553543100", size: 75 }
]

describe("IciCipher (0x9F as reverse-engineered)", () => {
  for (const example of examples) {
    test(`${example.name}: documented IV, body layout and packet size`, () => {
      const sealed = new IciCipher("test").seal(example.packet, iv(example.iv))
      const raw = decryptRaw("test", sealed)
      assert.equal(raw.ivInner, example.iv.replace(/ /g, ""), "the wire IV is the ECB-encrypted IV block")
      assert.ok(raw.body.startsWith(example.body.replace(/ /g, "")), `body ${raw.body}`)
      assert.equal(encoder.encodeEncrypted(sealed).length, example.size)
    })
  }

  test("seal and open round-trip through the wire format, for every data type", () => {
    const cipher = new IciCipher("test123")
    const values = [[DataType.Digital, false], [DataType.Analog, -3.25], [DataType.Text, "a longer text than twenty bytes"]] as const
    for (const [type, value] of values) {
      const result = new PacketDecoder().decode(encoder.encodeEncrypted(cipher.seal(DataPacket.of({ ...address, packetId: "analog" }, type, value))))
      assert.equal(result.kind, "encrypted")
      if (result.kind !== "encrypted") return
      const opened = cipher.open(result.packet)
      assert.equal(opened.kind, "data")
      if (opened.kind !== "data") return
      assert.deepEqual([opened.packet.packetId, opened.packet.dataType, opened.packet.value(), opened.packet.sourceId], ["analog", type, value, "server"])
    }
  })

  test("a wrong password is detected by the IV prefix", () => {
    const sealed = new IciCipher("test123").seal(examples[0]!.packet)
    assert.throws(() => new IciCipher("wrong").open(sealed), /wrong password/)
  })

  test("handshakes are one block (43 bytes) and open as challenge or response", () => {
    const cipher = new IciCipher("test123")
    const challenge = cipher.handshake("challenge", "server", "encrypte")
    assert.equal(encoder.encodeEncrypted(challenge).length, 43)
    const decoded = new PacketDecoder().decode(encoder.encodeEncrypted(challenge))
    assert.equal(decoded.kind === "encrypted" && cipher.open(decoded.packet).kind, "challenge")
    assert.equal(cipher.open(cipher.handshake("response", "encrypte", "server")).kind, "response")
  })

  test("IVs from one sequence share the suffix and count up, wrapping at 255", () => {
    const sequence = new IvSequence(Buffer.from("112233", "hex"))
    const blocks = Array.from({ length: 257 }, () => sequence.next(IvKind.Analog))
    assert.deepEqual([blocks[0]!.counter, blocks[255]!.counter, blocks[256]!.counter], [0, 255, 0])
    assert.ok(blocks.every(block => block.suffix.toString("hex") === "112233"))
    assert.notDeepEqual(blocks[0]!.nonce, blocks[1]!.nonce)
  })

  test("data types map to IV kinds (digital 0x2B, analog 0x2A, text 0x29)", () => {
    assert.deepEqual([DataType.Digital, DataType.Analog, DataType.Text].map(IvBlock.kindOf), [0x2b, 0x2a, 0x29])
    assert.equal(iv("4c01e2c5 4e 00000000000000 00 000000").dataType, undefined)
    assert.equal(IvBlock.parse(Buffer.alloc(16)), undefined)
  })
})
