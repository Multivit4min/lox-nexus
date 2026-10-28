import assert from "node:assert/strict"
import { test } from "node:test"
import { GitUrl } from "./GitUrl.ts"
import { InstallError } from "./InstallError.ts"

const refused = (url: string, ref = "main", schemes?: string[]) =>
  assert.throws(() => GitUrl.parse(url, ref, schemes), (error: unknown) => error instanceof InstallError && error.reason === "invalid-source", `${url} @ ${ref}`)

test("https URLs pass, normalized", () => {
  const parsed = GitUrl.parse("https://github.com/owner/plugin.git", "v1.2.0")
  assert.equal(parsed.url, "https://github.com/owner/plugin.git")
  assert.equal(parsed.ref, "v1.2.0")
  assert.equal(GitUrl.parse("HTTPS://GitHub.com/a/b", "main").url, "https://github.com/a/b")
})

test("git transport tricks, other schemes and local paths are refused", () => {
  for (const url of [
    "ext::sh -c touch% /tmp/pwned", "file:///etc", "/tmp/repo", "git@github.com:owner/plugin.git", "ssh://git@github.com/a/b",
    "git://github.com/a/b", "http://github.com/a/b", "-uhttps://github.com/a/b", "--upload-pack=touch /tmp/x", "fd::17", "plugin"
  ]) refused(url)
})

test("tokens, spaces, control characters and overlong URLs are refused", () => {
  refused("https://token@github.com/a/b")
  refused("https://user:secret@github.com/a/b")
  refused("https://github.com/a b")
  refused("https://github.com/a\nb")
  refused(`https://github.com/${"a".repeat(2050)}`)
  refused("https://")
  refused("https://github.com/a/b?access_token=x")
  refused("https://github.com/a/b#token")
})

test("refs must be plain branch or tag names", () => {
  for (const ref of ["-b", "--upload-pack=x", "a..b", "a//b", "HEAD@{1}", "main.lock", "main/", "", "a b", "../x", "a".repeat(201)]) refused("https://github.com/a/b", ref)
  assert.equal(GitUrl.parse("https://github.com/a/b", "release/1.x").ref, "release/1.x")
})

test("tests may allow the file scheme", () => {
  assert.equal(GitUrl.parse("file:///tmp/plugin.git", "main", ["file"]).url, "file:///tmp/plugin.git")
  refused("https://github.com/a/b", "main", ["file"])
})
