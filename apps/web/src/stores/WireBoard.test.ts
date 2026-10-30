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

test("rows take the newer values from the stream, forces included, over the loaded ones", async () => {
  const signal = (id: string, value: number) => ({ id, topic: `t/${id}`, label: id, current: { topic: `t/${id}`, value: { type: "number", value } } })
  const context = {
    wires: { list: () => Promise.resolve([{ id: "w", label: "w", sourceId: "a", targetId: "b", transforms: [], enabled: true, syncOnStart: false, active: true }]) },
    bus: { signals: () => Promise.resolve([signal("a", 1), signal("b", 1)]) },
    miniservers: { list: () => Promise.resolve([]) },
    plugins: { list: () => Promise.resolve([]) }
  } as unknown as ConstructorParameters<typeof WireBoard>[0]
  const board = new WireBoard(context)
  await board.load()
  const live = new Map([["t/b", { topic: "t/b", value: { type: "number", value: 7 }, flags: { forced: true } }]])
  const [row] = board.rows(undefined, { get: (topic: string) => live.get(topic) as never })
  assert.deepEqual([row?.source?.current?.value, row?.target?.current?.value], [{ type: "number", value: 1 }, { type: "number", value: 7 }])
  assert.match(row?.status.text ?? "", /"b" is forced/)
  assert.deepEqual(board.rows()[0]?.target?.current?.value, { type: "number", value: 1 }, "without the stream, the loaded value")
})
