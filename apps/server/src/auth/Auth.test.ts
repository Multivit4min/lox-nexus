import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Database } from "../db/Database.ts"
import { MIGRATIONS } from "../db/migrations.ts"
import { Migrator } from "../db/Migrator.ts"
import { SessionRepository } from "../db/repositories/SessionRepository.ts"
import { UserRepository } from "../db/repositories/UserRepository.ts"
import { BusyError, ConcurrencyLimit } from "./ConcurrencyLimit.ts"
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
    assert.deepEqual(sessions.resolve(token), { userId: "u", renewed: false })
    assert.equal(repo.find(token), undefined, "the plain token is not in the database")
    clock.time += SessionService.TTL_MS * 0.75
    assert.deepEqual(sessions.resolve(token), { userId: "u", renewed: true }, "used in the second half, so extended")
    clock.time += SessionService.TTL_MS * 0.75
    assert.equal(sessions.resolve(token)?.userId, "u")
    clock.time += SessionService.TTL_MS
    assert.equal(sessions.resolve(token), undefined)
    assert.equal(sessions.resolve("made-up"), undefined)
  })

  test("isValid checks without extending", () => {
    const { clock, sessions } = setup()
    const token = sessions.create("u")
    clock.time += SessionService.TTL_MS * 0.9
    assert.equal(sessions.isValid(token), true)
    clock.time += SessionService.TTL_MS * 0.2
    assert.equal(sessions.isValid(token), false, "not extended by the check")
  })
})

describe("LoginThrottle", () => {
  test("counts attempts when they start, blocks after MAX_FAILURES, then lets go", () => {
    const clock = new ManualClock()
    const throttle = new LoginThrottle(clock)
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) assert.equal(throttle.begin("ip"), 0)
    assert.equal(throttle.begin("ip"), LoginThrottle.WINDOW_MS, "parallel attempts can't all pass")
    clock.time += LoginThrottle.WINDOW_MS
    assert.equal(throttle.begin("ip"), 0)
    throttle.succeeded("ip")
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) assert.equal(throttle.begin("ip"), 0, "a success starts over")
  })

  test("IPv6 addresses count per /64", () => {
    const throttle = new LoginThrottle(new ManualClock())
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) throttle.begin(`2001:db8:1:2::${i + 1}`)
    assert.ok(throttle.begin("2001:db8:1:2:ffff::9") > 0)
    assert.equal(throttle.begin("2001:db8:1:3::1"), 0)
    for (let i = 0; i < LoginThrottle.MAX_FAILURES; i++) throttle.begin("2001:db8::1")
    assert.ok(throttle.begin("2001:DB8:0:0::abcd") > 0, "compressed and uppercase forms share the /64")
    assert.equal(throttle.begin("2001:db9::1"), 0)
  })
})

describe("ConcurrencyLimit", () => {
  test("runs at most max at once, queues a few, refuses the rest", async () => {
    const limit = new ConcurrencyLimit(1, 1)
    let release!: () => void
    const first = limit.run(() => new Promise<void>(resolve => (release = resolve)))
    const second = limit.run(async () => "queued")
    await assert.rejects(limit.run(async () => "refused"), BusyError)
    release()
    await first
    assert.equal(await second, "queued")
  })
})
