import assert from "node:assert/strict"
import { test } from "node:test"
import { ChangelogSections } from "./ChangelogSections.ts"

const changelog = [
  "# Changelog",
  "",
  "## Unreleased",
  "",
  "- not out yet",
  "",
  "## 0.10.0 (2026-12-01)",
  "",
  "### Plugins",
  "",
  "- the scheduler",
  "",
  "## 0.9.0 (2026-11-15)",
  "",
  "- MCP",
  "",
  "## v0.8.1",
  "- a fix",
  "## 0.8.0 (2026-10-30)",
  "- the rewrite"
].join("\n")

test("one section per version with its date, without Unreleased; subheadings stay in the body", () => {
  const sections = ChangelogSections.parse(changelog)
  assert.deepEqual(sections.map(section => [section.version, section.date]), [["0.10.0", "2026-12-01"], ["0.9.0", "2026-11-15"], ["0.8.1", undefined], ["0.8.0", "2026-10-30"]])
  assert.equal(sections[0]?.markdown, "### Plugins\n\n- the scheduler")
})

test("between: after the running version up to the newest release, newest first, numbers compared as numbers", () => {
  const sections = ChangelogSections.parse(changelog)
  assert.deepEqual(ChangelogSections.between(sections, "0.8.0", "0.10.0").map(section => section.version), ["0.10.0", "0.9.0", "0.8.1"])
  assert.deepEqual(ChangelogSections.between(sections, "0.8.1", "0.9.0").map(section => section.version), ["0.9.0"], "a section the release doesn't have yet is left out")
  assert.deepEqual(ChangelogSections.between(sections, "0.10.0", "0.10.0"), [])
})

test("a hostile heading of megabytes is no version, and parsing it stays quick", () => {
  const started = performance.now()
  const sections = ChangelogSections.parse(`## 1.2.3${" ".repeat(2_000_000)}x\n- body\n## 1.0.0  \n- trailing spaces are fine`)
  assert.ok(performance.now() - started < 1000, "no backtracking on long lines")
  assert.deepEqual(sections.map(section => section.version), ["1.0.0"])
})
