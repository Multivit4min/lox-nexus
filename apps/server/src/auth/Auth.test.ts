import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Database } from "../db/Database.ts"
import { MIGRATIONS } from "../db/migrations.ts"
import { Migrator } from "../db/Migrator.ts"
import { SessionRepository } from "../db/repositories/SessionRepository.ts"
import { UserRepository } from "../db/repositories/UserRepository.ts"
import { LoginThrottle } from "./LoginThrottle.ts"
import { PasswordHasher } from "./PasswordHasher.ts"
import { SessionService } from "./SessionService.ts"

class ManualClock {
  constructor(public time = 1_000_000) {}
  now() {
    return this.time
  }
}

describe("PasswordHasher", () => {
  const hasher = new PasswordHasher(1024)

  test("verifies the right password only, with a fresh salt per hash", async () => {
    const hash = await hasher.hash("correct horse")
    assert.match(hash, /^scrypt\$1024\$8\$1\$/)
    assert.notEqual(hash, await hasher.hash("correct horse"))
    assert.equal(await hasher.verify("correct horse", hash), true)
    assert.equal(await hasher.verify("correct horsE", hash), false)
  })

  test("garbage instead of a hash is a failed login, not a crash", async () => {
    for (const stored of ["", "argon2$x", "scrypt$abc$8$1$c2FsdA$aGFzaA", "scrypt$1024$8$1$$"]) {
      assert.equal(await hasher.verify("x", stored), false, stored)
    }
  })
})

describe("SessionService", () => {
  const setup = () => {
    const db = new Database(":memory:")
    new Migrator(db, MIGRATIONS).migrate()
    new UserRepository(db).insert({ id: "u", username: "admin", password_hash: "x", created_at: 0 })
    const clock = new ManualClock()
    return { clock, repo: new SessionRepository(db), sessions: new SessionService(new SessionRepository(db), clock) }
  }

  test("stores only a hash, expires, and slides when used late in its life", () => {
    const { clock, repo, sessions } = setup()
    const token = sessions.create("u")
    assert.equal(sessions.resolve(token), "u")
    assert.equal(repo.find(token), undefined, "the plain token is not in the database")
    clock.time += SessionService.TTL_MS * 0.75
    assert.equal(sessions.resolve(token), "u", "used in the second half, so extended")
    clock.time += SessionService.TTL_MS * 0.75
    assert.equal(sessions.resolve(token), "u")
    clock.time += SessionService.TTL_MS
    assert.equal(sessions.resolve(token), undefined)
    assert.equal(sessions.resolve("made-up"), undefined)
  })
})

describe("LoginThrottle", () => {
  test("blocks after MAX_FAILURES within the window, then lets go", () => {
    const clock = new ManualClock()
    const throttle = new LoginThrottle(clock)
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) throttle.failed("ip")
    assert.equal(throttle.retryAfter("ip"), LoginThrottle.WINDOW_MS)
    clock.time += LoginThrottle.WINDOW_MS
    assert.equal(throttle.retryAfter("ip"), 0)
    throttle.failed("ip")
    throttle.succeeded("ip")
    assert.equal(throttle.retryAfter("ip"), 0)
  })
})
