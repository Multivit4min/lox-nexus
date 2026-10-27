import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PassThrough } from "node:stream"
import { fileURLToPath } from "node:url"
import { describe, test } from "node:test"
import { PasswordHasher } from "../auth/PasswordHasher.ts"
import { PasswordReset } from "../auth/PasswordReset.ts"
import { SessionService } from "../auth/SessionService.ts"
import { Persistence } from "../db/Persistence.ts"
import { LineEditor } from "./LineEditor.ts"
import { PipedPassword } from "./PipedPassword.ts"
import { ResetPasswordCommand, type PasswordSource } from "./ResetPasswordCommand.ts"
import { TerminalPassword, type TerminalInput } from "./TerminalPassword.ts"

const hasher = new PasswordHasher(1024)

/** a database with the given accounts, each with one live session */
const accounts = async (file: string, ...names: string[]) => {
  const persistence = new Persistence(file, () => undefined)
  const sessions = new SessionService(persistence.sessions, { now: () => Date.now() })
  for (const [index, username] of names.entries()) {
    persistence.users.insert({ id: `u${index}`, username, password_hash: await hasher.hash("old password"), created_at: 0 })
    sessions.create(`u${index}`)
  }
  return persistence
}
const resetOf = (persistence: Persistence) => new PasswordReset(persistence.db, persistence.users, persistence.sessions, hasher)

/** answers typed at a terminal, in order; records the prompts */
const typed = (...answers: string[]): PasswordSource & { prompts: string[] } => {
  const prompts: string[] = []
  return { interactive: true, prompts, read: async prompt => (prompts.push(prompt), answers.shift() ?? "") }
}

describe("password reset", () => {
  test("sets the new password and ends every session of that account only", async t => {
    const persistence = await accounts(":memory:", "admin", "other")
    t.after(() => persistence.close())
    const reset = resetOf(persistence)
    assert.equal(reset.account("ADMIN"), "admin", "names match case-insensitively")
    await reset.reset("admin", "new password")
    assert.equal(await hasher.verify("new password", persistence.users.findByName("admin")!.password_hash), true)
    assert.deepEqual(persistence.db.all<{ user_id: string }>("SELECT user_id FROM sessions").map(row => row.user_id), ["u1"])
    assert.throws(() => reset.check("short"), /8 to 256 characters/)
    assert.throws(() => reset.check("arrowpass\u001b[D"), /control characters/)
    assert.throws(() => reset.account("nobody"), /no account "nobody"; accounts: admin, other/)
    assert.throws(() => reset.account(), /several accounts exist \(admin, other\)/)
  })

  test("the command checks the account before asking, asks twice and refuses a mismatch", async t => {
    const lines: string[] = []
    const out = { info: (line: string) => void lines.push(line), error: (line: string) => void lines.push(`error: ${line}`) }
    const single = await accounts(":memory:", "admin")
    const none = await accounts(":memory:")
    t.after(() => [single, none].forEach(db => db.close()))
    assert.equal(await new ResetPasswordCommand(resetOf(single), typed("new password", "new password"), out).run([]), 0)
    assert.equal(await new ResetPasswordCommand(resetOf(single), typed("new password", "typo password"), out).run([]), 1)
    assert.match(lines.at(-1)!, /differ; nothing was changed/)
    const unknown = typed()
    assert.equal(await new ResetPasswordCommand(resetOf(single), unknown, out).run(["--", "admn"]), 1)
    assert.deepEqual(unknown.prompts, [], "a wrong name is refused before any password is typed")
    const short = typed("short")
    assert.equal(await new ResetPasswordCommand(resetOf(single), short, out).run([]), 1)
    assert.equal(short.prompts.length, 1, "a too short password is refused before it is repeated")
    assert.equal(await new ResetPasswordCommand(resetOf(none), typed(), out).run([]), 1)
    assert.match(lines.at(-1)!, /no account yet/)
  })
})

describe("password input", () => {
  test("the line editor drops escape sequences and control keys, deletes whole characters and keeps pasted lines", () => {
    const editor = new LineEditor()
    editor.feed("arrowpass\u001b[D\u001bOA\u001a\u0015x\u007f emoji😀\u007f\r")
    assert.equal(editor.take(), "arrowpass emoji")
    editor.feed("first\r")
    editor.feed("\nsecond\r")
    assert.deepEqual([editor.take(), editor.take(), editor.take()], ["first", "second", undefined], "a \\r\\n split across reads is one Enter")
    editor.feed("\u0003")
    assert.equal(editor.take(), null)
  })

  test("the terminal prompt restores the terminal on Enter, cancel and end of input", async () => {
    const input = Object.assign(new PassThrough(), { rawMode: [] as boolean[], setRawMode(mode: boolean) { this.rawMode.push(mode); return this } })
    const output = { written: "", write(text: string) { this.written += text; return true } }
    const terminal = new TerminalPassword(input as unknown as TerminalInput, output as never, new EventEmitter() as unknown as NodeJS.Process)
    const first = terminal.read("1: ")
    input.write("pw1\rpw2\r")
    assert.deepEqual([await first, await terminal.read("2: ")], ["pw1", "pw2"], "a pasted second line answers the next prompt")
    const cancelled = terminal.read("3: ")
    input.write("\u0003")
    await assert.rejects(cancelled, /cancelled/)
    const ended = terminal.read("4: ")
    input.end()
    await assert.rejects(ended, /input ended/)
    assert.deepEqual(input.rawMode, [true, false, true, false, true, false, true, false])
    assert.doesNotMatch(output.written, /pw/, "nothing typed is echoed")
  })

  test("piped input decodes UTF-8 split across reads and stops at the first line", async () => {
    const input = new PassThrough()
    const read = new PipedPassword(input, { write: () => true }).read()
    input.write(Buffer.from([0x61, 0x62, 0xc3]))
    setImmediate(() => input.end(Buffer.concat([Buffer.from([0xa4]), Buffer.from("pfelbaum\r\nignored\n")])))
    assert.equal(await read, "abäpfelbaum")
  })
})

test("reset-password.ts reads piped input, uses NEXUS_DATA_DIR and refuses a database it would have to migrate", { timeout: 30_000 }, async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-reset-"))
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  const file = path.join(dataDir, "nexus.db")
  ;(await accounts(file, "admin")).close()
  const entry = fileURLToPath(new URL("../reset-password.ts", import.meta.url))
  const run = async (stdin: string) => {
    const child = spawn(process.execPath, ["--conditions=@lox-nexus/source", "--import", "tsx", entry], { env: { ...process.env, NEXUS_DATA_DIR: dataDir } })
    let output = ""
    child.stdout.on("data", chunk => (output += chunk))
    child.stderr.on("data", chunk => (output += chunk))
    child.stdin.end(stdin)
    return { code: await new Promise(resolve => child.on("close", resolve)), output }
  }
  const done = await run("piped password\n")
  assert.equal(done.code, 0, done.output)
  const check = new Persistence(file, () => undefined)
  assert.equal(await hasher.verify("piped password", check.users.findByName("admin")!.password_hash), true)
  assert.deepEqual(check.db.all("SELECT * FROM sessions"), [])
  check.db.exec("PRAGMA user_version = 1")
  check.close()
  const refused = await run("another password\n")
  assert.equal(refused.code, 1)
  assert.match(refused.output, /schema is older than this version/)
})
