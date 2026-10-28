import assert from "node:assert/strict"
import { test } from "node:test"
import { PacketDecoder } from "../codec/PacketDecoder.ts"
import { Fixtures } from "../test-support/Fixtures.ts"
import { PayloadCodecs } from "./PayloadCodecs.ts"
import { DataType } from "../DataType.ts"
import { T5Buttons } from "./T5Buttons.ts"

// the user pressed middle, left top, left bottom, right top and right bottom alone, then both top
// and both bottom buttons together; the top pair arrived one finger at a time (2, 3, then 1 on release)
test("the 2026-10-28 T5 capture decodes to the pressed buttons by position", () => {
  const decoder = new PacketDecoder()
  const codec = PayloadCodecs.for(DataType.T5)
  const pressed: string[][] = []
  for (const datagram of Fixtures.datagrams("2026-10-23-live/t5-buttons-2026-10-28.jsonl")) {
    const decoded = decoder.decode(datagram)
    if (decoded?.kind !== "data" || decoded.packet.packetId !== "t5") continue
    const names = T5Buttons.of(codec.decode(decoded.packet.payload)).names()
    if (names.length) pressed.push(names)
  }
  assert.deepEqual(pressed, [
    ["middle"], ["left-upper"], ["left-lower"], ["right-upper"], ["right-lower"],
    ["right-upper"], ["left-upper", "right-upper"], ["left-upper"],
    ["left-lower", "right-lower"]
  ])
})
