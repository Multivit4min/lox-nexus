import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { after, before, test } from "node:test"
import { LoggerFactory } from "../../logging/LoggerFactory.ts"
import { FixtureBundle } from "../../test-support/install/FixtureBundle.ts"
import { GitFixture } from "../../test-support/install/GitFixture.ts"
import { GitRunner } from "./GitRunner.ts"
import { GitSource } from "./GitSource.ts"
import { GitUrl } from "./GitUrl.ts"
import { InstallError } from "./InstallError.ts"
import { InstallLimits } from "./InstallLimits.ts"

let root: string
let repo: GitFixture
let commit: string
before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lox-nexus-git-"))
  repo = new GitFixture(root)
  commit = repo.commit({ "package.json": FixtureBundle.manifest(), "dist/plugin.js": await FixtureBundle.bundle(), "dist/plugin.js.map": "{}", "README.md": "x" }, "v1.0.0")
})
after(() => fs.rmSync(root, { recursive: true, force: true }))

const runner = (options: Partial<{ binary: string; timeoutMs: number }> = {}) =>
  new GitRunner({ protocols: ["file"], timeoutMs: 30_000, ...options }, LoggerFactory.silent())

function source(ref: string, limits = new InstallLimits(), git = runner()) {
  return new GitSource(GitUrl.parse(repo.url, ref, ["file"]), git, limits)
}

function staging() {
  return path.join(fs.mkdtempSync(path.join(root, "staging-")), "package")
}

async function refused(work: Promise<unknown>, reason: InstallError["reason"], pattern: RegExp) {
  await assert.rejects(work, (error: unknown) => error instanceof InstallError && error.reason === reason && pattern.test(error.message) || assert.fail(String(error)))
}

test("fetches package.json, the bundle, its map and the README from a tag, without a checkout", async () => {
  const target = staging()
  const fetched = await source("v1.0.0").fetch(target)
  assert.deepEqual(fetched.origin, { kind: "git", url: repo.url, ref: "v1.0.0", commit })
  assert.equal(fetched.manifest.version, "1.0.0")
  assert.deepEqual(fs.readdirSync(target, { recursive: true }).map(String).sort(), ["README.md", "dist", "dist/plugin.js", "dist/plugin.js.map", "package.json"])
  assert.deepEqual(fs.readFileSync(path.join(target, "dist/plugin.js")), await FixtureBundle.bundle())
  // the clone is gone once the files are read
  assert.equal(fs.existsSync(path.join(path.dirname(target), "git")), false)
})

test("the user's global git config is ignored", async () => {
  const target = staging()
  // if git read this, every file:// URL would point nowhere
  fs.writeFileSync(path.join(path.dirname(target), ".gitconfig"), "[url \"file:///nonexistent/\"]\n\tinsteadOf = file://\n")
  assert.equal((await source("main").fetch(target)).origin.kind, "git")
})

test("symbolic links, submodules and LFS pointers are refused", async () => {
  repo.symlink("dist/plugin.js", "/etc/passwd", "symlink")
  await refused(source("symlink").fetch(staging()), "invalid-package", /plain file/)
  repo.submodule("dist/plugin.js", "submodule")
  await refused(source("submodule").fetch(staging()), "invalid-package", /plain file/)
  repo.commit({ "dist/plugin.js": "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n" }, "lfs")
  await refused(source("lfs").fetch(staging()), "invalid-package", /Git LFS/)
  repo.commit({ "dist/plugin.js": await FixtureBundle.bundle() }, "restored")
})

test("a missing bundle, an unknown ref and an oversized file", async () => {
  repo.commit({ "package.json": FixtureBundle.manifest({}, { entry: "build/missing.js" }) }, "no-bundle")
  await refused(source("no-bundle").fetch(staging()), "invalid-package", /not in the repository/)
  await refused(source("does-not-exist").fetch(staging()), "git-failed", /git clone failed: .*does-not-exist/)
  await refused(source("v1.0.0", new InstallLimits({ bundleBytes: 1024 })).fetch(staging()), "invalid-package", /larger than 1 KiB/)
  await refused(source("v1.0.0", new InstallLimits({ gitStoreBytes: 100 })).fetch(staging()), "invalid-source", /download is too large/)
})

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

test("a hanging git is killed after the timeout with every helper it started; a missing git says so", async () => {
  // like cat-file on a partial clone, which leaves the download to a child process
  const pidFile = path.join(root, "helper.pid")
  const fake = path.join(root, "slow-git")
  fs.writeFileSync(fake, `#!/bin/sh\nsleep 30 &\necho $! > ${pidFile}\nwait\n`, { mode: 0o755 })
  await refused(source("v1.0.0", new InstallLimits(), runner({ binary: fake, timeoutMs: 300 })).fetch(staging()), "timeout", /longer than 0.3 s/)
  const helper = Number(fs.readFileSync(pidFile, "utf8"))
  // the killed helper is reaped by init, which may take a moment
  for (let i = 0; i < 50 && alive(helper); i++) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(alive(helper), false)
  await refused(source("v1.0.0", new InstallLimits(), runner({ binary: path.join(root, "no-git") })).fetch(staging()), "git-failed", /not installed/)
})

test("every git call gets the hardening options and a minimal environment", () => {
  const git = new GitRunner({ timeoutMs: 1000 }, LoggerFactory.silent())
  assert.deepEqual(git.prefix(), [
    "--literal-pathspecs", "-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "credential.helper=",
    "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.symlinks=false"
  ])
  const env = git.environment("/staging")
  assert.deepEqual(Object.keys(env).sort(), ["GIT_ALLOW_PROTOCOL", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_TERMINAL_PROMPT", "HOME", "LC_ALL", "PATH"])
  assert.equal(env.GIT_ALLOW_PROTOCOL, "https")
  assert.equal(env.HOME, "/staging")
})
