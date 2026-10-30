import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { LoggerFactory } from "../../logging/LoggerFactory.ts"
import { GitFixture } from "../../test-support/install/GitFixture.ts"
import { GitRemote } from "./GitRemote.ts"
import { GitRunner } from "./GitRunner.ts"

let root: string
let repo: GitFixture
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lox-nexus-ls-remote-test-"))
  repo = new GitFixture(root)
})
after(() => fs.rmSync(root, { recursive: true, force: true }))

const remote = () => new GitRemote(new GitRunner({ protocols: ["file"], timeoutMs: 30_000 }, LoggerFactory.silent()), ["file"])
const ownTempDirs = () => fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("lox-nexus-ls-remote-") && !root.endsWith(name))

test("ls-remote names the commit a tag points at, follows new commits and refuses an unknown ref", async () => {
  const before = ownTempDirs()
  const first = repo.commit({ "README.md": "one" }, "v1")
  assert.equal(await remote().commit(repo.url, "v1"), first)
  const second = repo.commit({ "README.md": "two" }, "v2")
  assert.equal(await remote().commit(repo.url, "v2"), second)
  assert.equal(await remote().commit(repo.url, "v1"), first, "a tag stays where it was")
  await assert.rejects(remote().commit(repo.url, "v3"), /no branch or tag "v3"/)
  assert.deepEqual(ownTempDirs(), before, "the temporary HOME is removed, also after a failure")
})

test("a scheme that isn't allowed is refused before git runs", async () => {
  const strict = new GitRemote(new GitRunner({ protocols: ["https"], timeoutMs: 30_000 }, LoggerFactory.silent()))
  await assert.rejects(strict.commit(repo.url, "v1"), (error: Error & { reason?: string }) => error.reason === "invalid-source")
})

test("ls-remote output: a branch before a tag, an annotated tag's commit, an unknown ref refused", () => {
  const output = [
    `${"a".repeat(40)}\trefs/heads/main`,
    `${"b".repeat(40)}\trefs/tags/v1`,
    `${"c".repeat(40)}\trefs/tags/v1^{}`,
    `${"d".repeat(40)}\trefs/tags/main`
  ].join("\n")
  assert.equal(GitRemote.pick(output, "main"), "a".repeat(40))
  assert.equal(GitRemote.pick(output, "v1"), "c".repeat(40))
  assert.throws(() => GitRemote.pick(output, "v2"), /no branch or tag "v2"/)
})
