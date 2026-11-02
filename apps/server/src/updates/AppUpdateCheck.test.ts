import assert from "node:assert/strict"
import { afterEach, beforeEach, mock, test } from "node:test"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import { AppUpdateCheck } from "./AppUpdateCheck.ts"
import type { Release } from "./ReleaseFeed.ts"

const CHANGELOG = "# Changelog\n\n## Unreleased\n\n## 0.10.0 (2026-12-01)\n\n- ten\n\n## 0.9.0 (2026-11-15)\n\n- nine\n\n## 0.8.0 (2026-10-30)\n\n- eight"
const release = (version: string): Release => ({ version, tag: `v${version}`, url: `https://github.com/x/releases/tag/v${version}`, filesUrl: `https://github.com/x/blob/v${version}/` })
const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve))
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.parse("2026-12-02T10:00:00Z") }))
afterEach(() => mock.timers.reset())

type Latest = (signal?: AbortSignal) => Promise<Release | undefined>

/** a check with an in-memory settings table and a feed that answers `latest` */
const setup = (options: { current?: string; allowed?: boolean; latest?: Latest; stored?: unknown } = {}) => {
  const table = new Map<string, unknown>(options.stored ? [[AppUpdateCheck.KEY, options.stored]] : [])
  const feed = { asked: 0, latest: options.latest ?? (async () => release("0.10.0")) }
  const counted = { latest: (signal?: AbortSignal) => (feed.asked++, feed.latest(signal)), changelog: async () => CHANGELOG }
  const settings = { get: (key: string) => table.get(key), set: (key: string, value: unknown) => void table.set(key, value) }
  const check = new AppUpdateCheck(counted, settings, options.current ?? "0.8.0",
    { allowed: options.allowed ?? true, clock: { now: () => Date.now() }, log: LoggerFactory.silent() })
  return { check, feed, table }
}

test("asks a minute after the start and then daily; finds the newest and the changes since the running version", async t => {
  const { check, feed } = setup()
  t.after(() => check.dispose())
  check.start()
  mock.timers.tick(59_000)
  assert.equal(feed.asked, 0, "not while the network may still be coming up")
  mock.timers.tick(1000)
  await settle()
  const dto = check.dto()
  assert.deepEqual([dto.current, dto.available?.version, dto.changes.map(change => change.version), dto.answeredAt], ["0.8.0", "0.10.0", ["0.10.0", "0.9.0"], Date.now()])
  assert.equal(dto.available?.filesUrl, "https://github.com/x/blob/v0.10.0/")
  mock.timers.tick(AppUpdateCheck.DAY_MS)
  await settle()
  assert.equal(feed.asked, 2)
})

test("a failed check is tried again an hour later, not a day", async t => {
  let fail = true
  const { check, feed } = setup({ latest: async () => {
    if (fail) throw new Error("can't reach GitHub: getaddrinfo EAI_AGAIN")
    return release("0.10.0")
  } })
  t.after(() => check.dispose())
  check.start()
  mock.timers.tick(AppUpdateCheck.FIRST_MS)
  await settle()
  assert.deepEqual([feed.asked, check.dto().error, check.dto().answeredAt], [1, "can't reach GitHub: getaddrinfo EAI_AGAIN", undefined])
  fail = false
  mock.timers.tick(AppUpdateCheck.RETRY_MS)
  await settle()
  assert.deepEqual([feed.asked, check.dto().error, check.dto().available?.version], [2, undefined, "0.10.0"])
})

test("switched off, it doesn't ask by itself but Check now still works; a restart within a day waits for the rest of it", async t => {
  const { check, feed, table } = setup()
  t.after(() => check.dispose())
  check.setEnabled(false)
  check.start()
  mock.timers.tick(AppUpdateCheck.FIRST_MS + AppUpdateCheck.DAY_MS)
  await settle()
  assert.equal(feed.asked, 0)
  assert.equal((await check.check()).available?.version, "0.10.0")
  const restarted = setup({ stored: table.get(AppUpdateCheck.KEY) })
  t.after(() => restarted.check.dispose())
  restarted.check.setEnabled(true)
  restarted.check.start()
  mock.timers.tick(AppUpdateCheck.DAY_MS - 1000)
  await settle()
  assert.equal(restarted.feed.asked, 0, "the last check was less than a day ago")
  mock.timers.tick(1000)
  await settle()
  assert.equal(restarted.feed.asked, 1)
})

test("Check now: two at once ask once, again within a minute of an answer asks nobody, a failure keeps the last result", async t => {
  let fail = false
  const { check, feed } = setup({ latest: async () => {
    if (fail) throw new Error("can't reach GitHub: no answer")
    return release("0.9.0")
  } })
  t.after(() => check.dispose())
  const [a, b] = await Promise.all([check.check(), check.check()])
  assert.deepEqual([a, feed.asked], [b, 1])
  await check.check()
  assert.equal(feed.asked, 1, "GitHub allows 60 asks an hour per address")
  mock.timers.tick(AppUpdateCheck.COOLDOWN_MS)
  fail = true
  const failed = await check.check()
  assert.deepEqual([feed.asked, failed.available?.version, failed.changes.map(change => change.version), failed.error], [2, "0.9.0", ["0.9.0"], "can't reach GitHub: no answer"])
  assert.ok(failed.checkedAt! > failed.answeredAt!, "the card mustn't call 0.8.0 the newest on a failed check alone")
  fail = false
  assert.equal((await check.check()).error, undefined, "no cooldown after a failure")
})

test("switching off while GitHub is asked sticks", async t => {
  let answer: (release: Release) => void = () => {}
  const { check } = setup({ latest: () => new Promise(resolve => (answer = resolve)) })
  t.after(() => check.dispose())
  const running = check.check()
  check.setEnabled(false)
  answer(release("0.9.0"))
  assert.equal((await running).enabled, false)
})

test("stopping while GitHub is asked aborts it and writes nothing to the closed database", async () => {
  let aborted = false
  const { check, table } = setup({ latest: signal => new Promise((_resolve, reject) => signal?.addEventListener("abort", () => {
    aborted = true
    reject(new Error("aborted"))
  })) })
  const running = check.check()
  table.clear()
  await check.dispose()
  await assert.rejects(running, /Nexus is stopping/)
  assert.deepEqual([aborted, table.size], [true, 0])
})

test("after Nexus itself was updated, or with checks forbidden, a stored answer offers nothing", async () => {
  const stored = { enabled: true, checkedAt: 1, answeredAt: 1, available: { version: "0.9.0", url: "u", filesUrl: "f" }, changes: [{ version: "0.9.0", markdown: "- nine" }] }
  assert.deepEqual([setup({ current: "0.9.0", stored }).check.dto().available, setup({ current: "0.9.0", stored }).check.dto().changes], [undefined, []])
  assert.deepEqual([setup({ allowed: false, stored }).check.dto().available, setup({ allowed: false, stored }).check.dto().changes], [undefined, []])
  const dto = await setup({ current: "0.10.0" }).check.check()
  assert.deepEqual([dto.available, dto.changes], [undefined, []])
})

test("NEXUS_UPDATE_CHECK=false: no timer, and Check now is refused", async t => {
  const { check, feed } = setup({ allowed: false })
  t.after(() => check.dispose())
  check.start()
  mock.timers.tick(AppUpdateCheck.DAY_MS * 2)
  await settle()
  assert.equal(feed.asked, 0)
  assert.equal(check.dto().disabledByServer, true)
  assert.throws(() => check.check(), /switched off on the server/)
})
