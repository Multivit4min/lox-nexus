import assert from "node:assert/strict"
import { test } from "node:test"
import type { WireDto } from "@lox-nexus/api"
import { WireBoard } from "./WireBoard.ts"

type Answer = (wires: WireDto[]) => void

// each load asks four endpoints; the test answers the wire lists by hand, in any order
const fakeContext = () => {
  const pending: Answer[] = []
  const context = {
    wires: { list: () => new Promise<WireDto[]>(resolve => pending.push(resolve)) },
    bus: { signals: () => Promise.resolve([]) },
    miniservers: { list: () => Promise.resolve([]) },
    plugins: { list: () => Promise.resolve([]) }
  }
  return { pending, context: context as unknown as ConstructorParameters<typeof WireBoard>[0] }
}
const wire = (label: string) => ({ id: label, label }) as WireDto

test("an older answer that arrives last doesn't replace a newer one", async () => {
  const { pending, context } = fakeContext()
  const board = new WireBoard(context)
  const older = board.load()
  const newer = board.load()
  pending[1]!([wire("newer")])
  await newer
  pending[0]!([wire("older")])
  await older
  assert.deepEqual(board.state.wires.map(w => w.label), ["newer"])
})

test("a poll is skipped while a load is still running", async () => {
  const { pending, context } = fakeContext()
  const board = new WireBoard(context)
  const first = board.load()
  await board.poll()
  assert.equal(pending.length, 1)
  pending[0]!([])
  await first
  const poll = board.poll()
  assert.equal(pending.length, 2, "polls again once nothing is running")
  pending[1]!([])
  await poll
})
