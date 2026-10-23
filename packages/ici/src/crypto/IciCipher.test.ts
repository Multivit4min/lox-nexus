import assert from "node:assert/strict"
import { createDecipheriv, createHash } from "node:crypto"
import { describe, test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { PacketEncoder } from "../codec/PacketEncoder.ts"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { IciCipher } from "./IciCipher.ts"

const packet = DataPacket.of({ sourceId: "server", targetId: "nexus", packetId: "analog" }, DataType.Analog, 3.5)

describe("IciCipher", () => {
  test("seal and open round-trip through the wire format", () => {
    const cipher = new IciCipher("secret")
    const wire = new PacketEncoder().encodeEncrypted(cipher.seal(packet))
    assert.equal(wire.readUint8(0), 0x9f)
    const result = new PacketDecoder().decode(wire)
    assert.equal(result.kind, "encrypted")
    if (result.kind !== "encrypted") return
    const opened = cipher.open(result.packet)
    assert.deepEqual([opened.packetId, opened.dataType, opened.value()], ["analog", DataType.Analog, 3.5])
  })

  test("uses the first 16 bytes of SHA256(password) as AES-128 key", () => {
    const iv = Buffer.alloc(16, 7)
    const sealed = new IciCipher("pw").seal(packet, iv)
    const key = createHash("sha256").update("pw").digest().subarray(0, 16)
    const decipher = createDecipheriv("aes-128-cbc", key, iv).setAutoPadding(false)
    const body = Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()])
    assert.equal(body.subarray(0, 6).toString("latin1"), "analog")
    assert.equal(body.readUint8(11), DataType.Analog)
  })

  test("a wrong password is rejected instead of yielding garbage", () => {
    const sealed = new IciCipher("pw").seal(packet, Buffer.alloc(16, 1))
    assert.throws(() => new IciCipher("wrong").open(sealed), /wrong password/)
  })

  test("at least two blocks are produced", () => {
    assert.ok(new IciCipher("pw").seal(packet).blockCount >= 2)
  })
})
