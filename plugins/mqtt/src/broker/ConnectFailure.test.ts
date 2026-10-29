import assert from "node:assert/strict"
import { test } from "node:test"
import { Backoff } from "./Backoff.ts"
import { ConnectFailure } from "./ConnectFailure.ts"

const failure = (error: unknown) => {
  const { message, fatal } = ConnectFailure.of(error)
  return [message, fatal]
}

test("refused logins and bad certificates are fatal, network trouble is not", () => {
  assert.deepEqual(failure(Object.assign(new Error("Connection refused: Bad username or password"), { code: 4 })), ["the broker refused the login: wrong user or password", true])
  assert.deepEqual(failure(Object.assign(new Error("x"), { code: 135 })), ["the broker refused the login: not authorized", true])
  assert.deepEqual(failure(Object.assign(new Error("x"), { code: 3 })), ["the broker is unavailable", false])
  assert.deepEqual(failure(Object.assign(new Error("x"), { code: 151 })), ["the broker refused the connection (code 151)", false])
  assert.deepEqual(failure(Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:1883"), { code: "ECONNREFUSED" })), ["connection refused: is the broker running on that host and port?", false])
  assert.deepEqual(failure(Object.assign(new Error("self-signed"), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }))[1], true)
  assert.match(String(failure(Object.assign(new Error("x"), { code: "CERT_HAS_EXPIRED" }))[0]), /Check TLS certificate/)
  assert.deepEqual(failure(Object.assign(new Error("odd"), { code: "EWHATEVER" })), ["odd (EWHATEVER)", false])
  assert.deepEqual(failure(new Error("connack timeout")), ["the broker didn't answer the connection request", false])
})

test("backoff: 1 s doubling up to a minute, from the start after a reset", () => {
  const backoff = new Backoff()
  assert.deepEqual(Array.from({ length: 9 }, () => backoff.next()), [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000])
  backoff.reset()
  assert.equal(backoff.next(), 1000)
})
