import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"

// moods 1–4 of the Lighting Controller "claude" on its Smart output, as the Miniserver mixes them
const MOODS: Record<number, [number, number, number, number]> = {
  0: [0, 0, 0, 0], 1: [100, 0, 0, 0], 2: [0, 80, 3, 0], 3: [0, 2, 60, 0], 4: [83, 30, 0, 39]
}

interface Line { label?: string; hex?: string }

// the flag 0x4000 appears on sequence steps; a long fade on a static mood doesn't set it
test("static moods never set the RGBW flags, whatever the fade time (2026-10-28 capture)", () => {
  const decoder = new PacketDecoder()
  const codec = new SmartRgbwCodec()
  const fades = new Set<number>()
  let fade = 0
  let mood = 0
  for (const line of Fixtures.lines<Line>("2026-10-23-live/rgbw-fade-2026-10-28.jsonl")) {
    // tx records are stamped when the send command returned, after the reply; the fade is sent
    // well before the moods, the mood is taken from the Miniserver's own moodout
    const [name, value] = (line.label ?? "").split("=")
    if (name === "fade") fade = Number(value)
    const decoded = line.hex ? decoder.decode(Buffer.from(line.hex, "hex")) : undefined
    if (decoded?.kind !== "data") continue
    if (decoded.packet.packetId === "moodout") mood = decoded.packet.payload.readDoubleLE(0)
    if (decoded.packet.packetId !== "lcout2") continue
    const { red, green, blue, white, fadeTime, flags } = codec.decode(decoded.packet.payload)
    assert.deepEqual({ colour: [red, green, blue, white], fadeTime, flags }, { colour: MOODS[mood], fadeTime: fade, flags: 0 })
    fades.add(fade)
  }
  assert.deepEqual([...fades].sort(), [0, 1, 5])
})
