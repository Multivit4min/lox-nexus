import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { SmartRgbwCodec } from "./SmartRgbwCodec.ts"

// mood 20's sequence on the Smart output as defined in Loxone Config: R100 → G80 B11 → G4 B100 → R100 G93 B58
const STEPS = [[100, 0, 0], [0, 80, 11], [0, 4, 100], [100, 93, 58]]

interface Line { t: number; run: string; label?: string; hex?: string }
interface Step { t: number; colour: number[]; fadeTime: number; flags: number }
interface Activation { fadingTime: number; steps: Step[] }

/** Each time mood 20 was switched on in a run: the FadingTime sent before, and the lcout2 changes (re-sends dropped). */
function activations(run: string) {
  const decoder = new PacketDecoder()
  const codec = new SmartRgbwCodec()
  const result: Activation[] = []
  let fadingTime = 0
  let mood = 0
  let last = ""
  for (const line of Fixtures.lines<Line>("2026-10-23-live/sequence-2026-10-28.jsonl").filter(l => l.run === run)) {
    if (line.label?.startsWith("fade=")) fadingTime = Number(line.label.slice(5))
    const decoded = line.hex ? decoder.decode(Buffer.from(line.hex, "hex")) : undefined
    if (decoded?.kind !== "data") continue
    const { packetId, payload } = decoded.packet
    if (packetId === "moodout") {
      const next = payload.readDoubleLE(0)
      if (next === 20 && mood !== 20) result.push({ fadingTime, steps: [] })
      mood = next
    }
    if (packetId !== "lcout2" || mood !== 20 || payload.toString("hex") === last) continue
    last = payload.toString("hex")
    const { red, green, blue, fadeTime, flags } = codec.decode(payload)
    result.at(-1)!.steps.push({ t: line.t, colour: [red, green, blue], fadeTime, flags })
  }
  return result
}

for (const [run, stepTime, fadingTimes] of [["seq3", 3, [0, 5]], ["seq6", 6, [0]]] as const) {
  test(`a lighting sequence with ${stepTime} s steps: first colour as a scene change, then flagged steps (2026-10-28 capture)`, () => {
    const runs = activations(run)
    assert.deepEqual(runs.map(a => a.fadingTime), fadingTimes)
    for (const { fadingTime, steps: [first, ...rest] } of runs) {
      assert.deepEqual(first, { t: first!.t, colour: STEPS[0], fadeTime: fadingTime, flags: 0 })
      assert.ok(rest.length >= 3, "the steps after the first colour")
      rest.forEach((step, i) => {
        assert.deepEqual(step.colour, STEPS[(i + 1) % STEPS.length])
        assert.deepEqual([step.fadeTime, step.flags], [stepTime, SmartRgbwCodec.FLAG_SEQUENCE_STEP])
        // the sequence starts once the scene change has faded in, then steps every step time
        const gap = (step.t - (i ? rest[i - 1]! : first!).t) / 1000
        assert.ok(Math.abs(gap - (i ? stepTime : fadingTime)) < 0.2, `step ${i + 1} came after ${gap} s`)
      })
    }
  })
}
