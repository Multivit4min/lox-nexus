import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Database } from "../db/Database.ts"
import { MIGRATIONS } from "../db/migrations.ts"
import { Migrator } from "../db/Migrator.ts"
import { SessionRepository } from "../db/repositories/SessionRepository.ts"
import { UserRepository } from "../db/repositories/UserRepository.ts"
import { AuthService } from "./AuthService.ts"
import { BusyError, ConcurrencyLimit } from "./ConcurrencyLimit.ts"
import { LoginThrottle } from "./LoginThrottle.ts"
import { PasswordHasher } from "./PasswordHasher.ts"
import { PasswordReset } from "./PasswordReset.ts"
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

describe("AuthService", () => {
  test("a login still checking the old password when the password is reset gets no session", async () => {
    const db = new Database(":memory:")
    new Migrator(db, MIGRATIONS).migrate()
    const users = new UserRepository(db)
    const sessionRows = new SessionRepository(db)
    const clock = new ManualClock()
    const real = new PasswordHasher(1024)
    users.insert({ id: "u1", username: "admin", password_hash: await real.hash("old password"), created_at: 0 })
    // verify() waits until the test lets it finish, so the reset can happen in between
    let finish: (() => void) | undefined
    const slow = { hash: (password: string) => real.hash(password), verify: async (password: string, stored: string) => {
      const result = await real.verify(password, stored)
      if (password === "old password") await new Promise<void>(resolve => (finish = resolve))
      return result
    } } as PasswordHasher
    const auth = new AuthService(db, users, new SessionService(sessionRows, clock), slow, clock)
    const login = auth.login("admin", "old password")
    while (!finish) await new Promise(resolve => setImmediate(resolve))
    await new PasswordReset(db, users, sessionRows, real).reset("admin", "new password")
    finish!()
    assert.equal(await login, undefined)
    assert.deepEqual(db.all("SELECT * FROM sessions"), [])
  })
})
