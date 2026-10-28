import assert from "node:assert/strict"
import { test } from "node:test"
import { InstallSources } from "./InstallSource.ts"

test("an update starts from the source the plugin came from", () => {
  const plugin = (source: object) => ({ active: { source } }) as never
  assert.deepEqual(InstallSources.updateOf(plugin({ kind: "git", url: "https://x/y.git", ref: "v1", commit: "c" })), { kind: "git", url: "https://x/y.git", ref: "v1", update: true })
  assert.deepEqual(InstallSources.updateOf(plugin({ kind: "local", folder: "/srv/plugins/fronius/" })), { kind: "local", folder: "fronius", update: true })
  assert.deepEqual(InstallSources.updateOf(plugin({ kind: "zip", fileName: "a.zip", archiveSha256: "s" })), { kind: "zip", update: true })
})
