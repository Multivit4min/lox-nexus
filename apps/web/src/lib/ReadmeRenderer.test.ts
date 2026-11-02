import assert from "node:assert/strict"
import { test } from "node:test"
import { ReadmeRenderer } from "./ReadmeRenderer.ts"

const renderer = new ReadmeRenderer()

test("markdown becomes HTML; links open in a new tab", () => {
  const html = renderer.render("# MQTT\n\nSee [the docs](https://example.org/x) and `code`.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n")
  assert.match(html, /<h1>MQTT<\/h1>/)
  assert.match(html, /<a href="https:\/\/example\.org\/x" target="_blank" rel="noopener noreferrer">the docs<\/a>/)
  assert.match(html, /<code>code<\/code>/)
  assert.match(html, /<table>/)
})

test("raw HTML is shown as text, script links are dropped, images become their alt text", () => {
  const html = renderer.render("<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n![a <b> diagram](docs/flow.png)\n")
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /href="javascript:/)
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /a &lt;b&gt; diagram/)
})

test("with a base, relative links point into it; absolute links, anchors and unsafe links don't change", () => {
  const html = new ReadmeRenderer("https://github.com/o/r/blob/v1.0.0/").render(
    "[ADR](docs/adr/0019.md) [site](https://example.org) [up](#top) [bad](javascript:alert(1))"
  )
  assert.match(html, /href="https:\/\/github\.com\/o\/r\/blob\/v1\.0\.0\/docs\/adr\/0019\.md"/)
  assert.match(html, /href="https:\/\/example\.org"/)
  assert.match(html, /href="#top"/)
  assert.doesNotMatch(html, /href="[^"]*javascript:/, "not made absolute either")
})
