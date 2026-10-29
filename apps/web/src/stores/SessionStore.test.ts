import assert from "node:assert/strict"
import { test } from "node:test"
import type { AuthStateDto } from "@lox-nexus/api"
import { SessionStore } from "./SessionStore.ts"

const store = (answers: AuthStateDto[]) => {
  const waits: number[] = []
  const auth = { state: async () => answers.shift() ?? { setupRequired: false }, setup: async () => answers[0]!, login: async () => answers[0]!, logout: async () => {} }
  return { session: new SessionStore(auth, async ms => void waits.push(ms)), waits }
}
const david = { setupRequired: false, user: { id: "u1", username: "david" } } as AuthStateDto

test("still logged in when the server knows the browser's (new) session, without waiting", async () => {
  const { session, waits } = store([david])
  assert.equal(await session.stillLoggedIn(), true)
  assert.equal(session.state.user?.username, "david")
  assert.deepEqual(waits, [])
})

test("a no is asked again once, a moment later: the new cookie may arrive after the stream closed", async () => {
  const late = store([{ setupRequired: false }, david])
  assert.equal(await late.session.stillLoggedIn(), true)
  assert.deepEqual(late.waits, [SessionStore.RECHECK_MS])
  const gone = store([{ setupRequired: false }, { setupRequired: false }])
  assert.equal(await gone.session.stillLoggedIn(), false)
})
