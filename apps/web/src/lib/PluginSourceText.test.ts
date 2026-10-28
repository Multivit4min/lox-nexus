import assert from "node:assert/strict"
import { test } from "node:test"
import { PluginSourceText } from "./PluginSourceText.ts"

test("sources read as one line and have a fingerprint", () => {
  const git = { kind: "git" as const, url: "https://github.com/owner/plugin.git", ref: "v1.2.0", commit: "3f9c2e1d".padEnd(40, "0") }
  assert.equal(PluginSourceText.short(git), "git github.com/owner/plugin @ v1.2.0 (3f9c2e1)")
  assert.equal(PluginSourceText.fingerprint(git), git.commit)
  assert.equal(PluginSourceText.short({ kind: "zip", fileName: "fx.zip", archiveSha256: "ab".repeat(32) }), "ZIP fx.zip (abababababab)")
  assert.equal(PluginSourceText.short({ kind: "local", folder: "/srv/plugins/fronius" }), "local folder /srv/plugins/fronius")
})
