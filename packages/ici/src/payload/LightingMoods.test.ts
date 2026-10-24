import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"

// each mood as Loxone Config defines it (PROTOCOL.md): RGB moods arrive as is, Kelvin moods mixed into red and white
const EXPECTED: Record<number, [number, number, number, number]> = {
  0: [0, 0, 0, 0], 50: [0, 0, 0, 80], 51: [7, 0, 0, 37], 99: [0, 0, 0, 100], 98: [100, 2, 2, 0], 60: [0, 2, 50, 0], 69: [100, 13, 13, 0]
}

test("every Lighting Controller mood of the 2026-10-24 capture decodes to its definition", () => {
  const decoder = new PacketDecoder()
  const codec = new SmartRgbwCodec()
  const seen = new Map<number, [number, number, number, number]>()
  let mood: number | undefined
  for (const line of Fixtures.lines<{ hex?: string }>("2026-10-23-live/lighting-moods-2026-10-24.jsonl")) {
    const decoded = line.hex ? decoder.decode(Buffer.from(line.hex, "hex")) : undefined
    if (decoded?.kind !== "data") continue
    if (decoded.packet.packetId === "moodout") mood = decoded.packet.payload.readDoubleLE(0)
    // the first colour after a mood change; mood 69's sequence steps follow it
    if (decoded.packet.packetId === "lcout" && mood !== undefined && !seen.has(mood)) {
      const { red, green, blue, white } = codec.decode(decoded.packet.payload)
      seen.set(mood, [red, green, blue, white])
    }
  }
  assert.deepEqual(Object.fromEntries(seen), EXPECTED)
})
