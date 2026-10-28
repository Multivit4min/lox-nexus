import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { SmartSingleChannelCodec } from "./SmartSingleChannelCodec.ts"
import { SmartTunableWhiteCodec } from "./SmartTunableWhiteCodec.ts"

// moods 10–12 of the Lighting Controller "claude" as Loxone Config defines them; off keeps the temperature
const MOODS: Record<number, { channel: number; temperature?: number; brightness: number }> = {
  10: { channel: 80, temperature: 4600, brightness: 80 },
  11: { channel: 60, temperature: 4000, brightness: 60 },
  12: { channel: 40, temperature: 3000, brightness: 40 },
  0: { channel: 0, brightness: 0 }
}

interface Line { dir: "tx" | "rx"; label?: string; hex?: string }

/** Every sasc/satw packet of the 2026-10-28 run, with the fade time sent and the mood reported before it. */
function packets() {
  const decoder = new PacketDecoder()
  const result: Array<{ fade: number; mood: number; id: string; payload: Buffer }> = []
  let fade = 0
  let mood = 0
  for (const line of Fixtures.lines<Line>("2026-10-23-live/fade-times-2026-10-28.jsonl")) {
    // tx records are stamped when the send command returned, so a reply can come before its send;
    // the fade is sent well before the moods, the mood is taken from the Miniserver's moodout
    const [name, value] = (line.label ?? "").split("=")
    if (name === "fade") fade = Number(value)
    const decoded = line.hex ? decoder.decode(Buffer.from(line.hex, "hex")) : undefined
    if (decoded?.kind === "data" && decoded.packet.packetId === "moodout") mood = decoded.packet.payload.readDoubleLE(0)
    if (decoded?.kind === "data" && ["sasc", "satw"].includes(decoded.packet.packetId)) {
      result.push({ fade, mood, id: decoded.packet.packetId, payload: decoded.packet.payload })
    }
  }
  return result
}

test("single channel and tunable white carry the mood and the fade time in 0.1 s (2026-10-28 capture)", () => {
  const single = new SmartSingleChannelCodec()
  const white = new SmartTunableWhiteCodec()
  const seen = new Set<number>()
  for (const { fade, mood, id, payload } of packets()) {
    const expected = MOODS[mood]!
    seen.add(fade)
    if (id === "sasc") {
      assert.deepEqual(single.decode(payload), { channel: expected.channel, fadeTime: fade })
      assert.deepEqual([...payload.subarray(0, 3), ...payload.subarray(6)], [0, 0, 0, 0, 0], "unknown bytes stay 0")
    } else {
      const value = white.decode(payload)
      assert.deepEqual({ brightness: value.brightness, fadeTime: value.fadeTime }, { brightness: expected.brightness, fadeTime: fade })
      if (expected.temperature) assert.equal(value.temperature, expected.temperature)
      assert.deepEqual([payload[6], payload[7]], [0x00, 0x08], "bytes 6–7 are a constant 0x0800")
    }
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 5])
})
