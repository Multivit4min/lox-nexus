import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { PacketEncoder } from "../codec/PacketEncoder.ts"
import { IciCipher } from "../crypto/IciCipher.ts"
import { DataType } from "../DataType.ts"
import { DataPacket } from "../packet/DataPacket.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { CaptureFilter } from "./CaptureFilter.ts"
import { PacketDescriber } from "./PacketDescriber.ts"

const decoder = new PacketDecoder()
const encoder = new PacketEncoder()
const cipher = new IciCipher("pw")
const data = (packetId: string) => DataPacket.of({ sourceId: "server", targetId: "claude", packetId }, DataType.Analog, 1)
const decode = (buffer: Buffer) => decoder.decode(buffer)

test("--only filters data and decryptable packets but never hides heartbeats or junk", () => {
  const filter = new CaptureFilter(["rand"], cipher)
  const status = decode(Fixtures.datagrams("2026-10-23-live/status-0x8d.jsonl")[0]!)
  assert.deepEqual([
    filter.shows(decode(encoder.encodeData(data("rand")))),
    filter.shows(decode(encoder.encodeData(data("other")))),
    filter.shows(decode(encoder.encodeEncrypted(cipher.seal(data("rand"))))),
    filter.shows(decode(encoder.encodeEncrypted(cipher.seal(data("other"))))),
    filter.shows(status),
    filter.shows(decode(Buffer.from([0x9e])))
  ], [true, false, true, false, true, true])
  const withoutPassword = new CaptureFilter(["rand"])
  assert.equal(withoutPassword.shows(decode(encoder.encodeEncrypted(cipher.seal(data("other"))))), true, "unreadable packets stay visible")
})

test("encrypted packets keep their raw datagram, so unusual header bytes are reported", () => {
  const wire = encoder.encodeEncrypted(cipher.seal(data("rand")))
  wire[3] = 0x07
  const result = decode(Buffer.concat([wire, Buffer.from("ff", "hex")]))
  assert.ok(result.kind === "encrypted")
  assert.deepEqual(result.packet.reservedNonZero(), [3])
  assert.equal(result.packet.trailing().toString("hex"), "ff")
  assert.match(new PacketDescriber(cipher).describe(result, wire), /🔓 .*rand.*⚠ non-zero reserved bytes 3=7.*⚠ trailing bytes ff/)
})
