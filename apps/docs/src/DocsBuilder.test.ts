import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { before, describe, test } from "node:test"
import { DocsBuilder } from "./DocsBuilder.ts"
import { MarkdownRenderer } from "./MarkdownRenderer.ts"
import { SitePath } from "./SitePath.ts"

/** a repository with content/, assets/ and an includable README, in a temp dir removed after the test */
const fixture = (t: { after: (fn: () => void) => void }, pages: Record<string, string>, nav: object) => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-docs-"))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const content = path.join(repository, "content")
  for (const [file, text] of Object.entries({ ...pages, "nav.json": JSON.stringify(nav) })) {
    fs.mkdirSync(path.dirname(path.join(content, file)), { recursive: true })
    fs.writeFileSync(path.join(content, file), text)
  }
  fs.mkdirSync(path.join(repository, "assets"))
  fs.writeFileSync(path.join(repository, "assets", "style.css"), "")
  fs.writeFileSync(path.join(repository, "README.md"), "# Included\n\nfrom elsewhere")
  return { content, assets: path.join(repository, "assets"), out: path.join(repository, "dist"), repository }
}

describe("SitePath", () => {
  test("links between pages are relative, so any base path works", () => {
    assert.equal(SitePath.link("guide/a.html", "plugins/b.html"), "../plugins/b.html")
    assert.equal(SitePath.link("index.html", "guide/a.html"), "guide/a.html")
    assert.equal(SitePath.link("guide/a.html", "guide/a.html"), "a.html")
    assert.deepEqual([SitePath.root("index.html"), SitePath.root("a/b/c.html")], ["./", "../../"])
    assert.deepEqual(SitePath.resolve("guide/a.md", "../plugins/b.md#setup"), { path: "plugins/b.html", anchor: "setup" })
    assert.equal(SitePath.resolve("a.md", "https://example.com"), undefined)
  })
})

describe("DocsBuilder", () => {
  let renderer: MarkdownRenderer
  before(async () => (renderer = await MarkdownRenderer.create()))

  test("builds pages with relative links, includes, highlighting, search and a 404 page", t => {
    const paths = fixture(t, {
      "index.md": "# Home\n\nSee [the guide](guide/start.md#first-steps).\n\n```ts\nconst a = 1\n```",
      "guide/start.md": "# Start\n\n## First steps\n\nBack [home](../index.md).\n\n<!--@include: ../../README.md-->"
    }, { title: "Docs", sections: [{ title: "Guide", pages: ["index.md", "guide/start.md"] }] })
    assert.equal(new DocsBuilder(paths, renderer).build(), 2)
    const home = fs.readFileSync(path.join(paths.out, "index.html"), "utf8")
    assert.match(home, /href="guide\/start\.html#first-steps"/)
    assert.match(home, /href="\.\/assets\/style\.css"/)
    assert.match(home, /class="shiki/)
    const start = fs.readFileSync(path.join(paths.out, "guide", "start.html"), "utf8")
    assert.match(start, /href="\.\.\/index\.html"/)
    assert.match(start, /<h2 id="first-steps">/)
    assert.match(start, /from elsewhere/, "the include is expanded")
    assert.doesNotMatch(start, /href="\//, "no absolute links")
    const index = JSON.parse(fs.readFileSync(path.join(paths.out, "search-index.json"), "utf8")) as Array<{ url: string; title: string }>
    assert.deepEqual(index.map(page => [page.url, page.title]), [["index.html", "Home"], ["guide/start.html", "Start"]])
    assert.ok(fs.existsSync(path.join(paths.out, "404.html")))
  })

  test("refuses broken links, unknown anchors and absolute links", t => {
    const paths = fixture(t, {
      "index.md": "# Home\n\n[gone](missing.md) [anchor](other.md#nope) [absolute](/docs/other.html) [fine](other.md)",
      "other.md": "# Other"
    }, { title: "Docs", sections: [{ title: "All", pages: ["index.md", "other.md"] }] })
    assert.throws(() => new DocsBuilder(paths, renderer).build(), (error: Error) =>
      /missing\.md doesn't lead to a page/.test(error.message) && /no heading #nope/.test(error.message) && /absolute link/.test(error.message))
  })

  test("refuses includes from outside the repository and pages missing from nav.json's list", t => {
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-outside-"))
    t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }))
    fs.writeFileSync(path.join(elsewhere, "secret.md"), "secret")
    const outside = fixture(t, { "index.md": "# Home" }, { title: "Docs", sections: [{ title: "All", pages: ["index.md"] }] })
    // content/ is two levels below the temp dir, next to which `elsewhere` lies
    fs.writeFileSync(path.join(outside.content, "index.md"), `# Home\n<!--@include: ../../${path.basename(elsewhere)}/secret.md-->`)
    assert.throws(() => new DocsBuilder(outside, renderer).build(), /outside the repository/)
    const missing = fixture(t, { "index.md": "# Home" }, { title: "Docs", sections: [{ title: "All", pages: ["index.md", "nope.md"] }] })
    assert.throws(() => new DocsBuilder(missing, renderer).build(), /lists nope\.md, which doesn't exist/)
  })

  test("headings show their text, not their markdown; images and raw HTML links are checked; content files are copied", t => {
    const paths = fixture(t, {
      "index.md": "# Home `code`\n\n## The [`Plugin`](other.md#top) class\n\n![logo](img/logo.png)\n\n<a href=\"/abs.html\">x</a>",
      "other.md": "# Top",
      "img/logo.png": "png"
    }, { title: "Docs", sections: [{ title: "All", pages: ["index.md", "other.md"] }] })
    assert.throws(() => new DocsBuilder(paths, renderer).build(), /absolute link \/abs\.html/)
    fs.writeFileSync(path.join(paths.content, "index.md"), "# Home `code`\n\n## The [`Plugin`](other.md#top) class\n\n![logo](img/logo.png)")
    new DocsBuilder(paths, renderer).build()
    const home = fs.readFileSync(path.join(paths.out, "index.html"), "utf8")
    assert.match(home, /<title>Home code · Docs<\/title>/)
    assert.match(home, /<h2 id="the-plugin-class">/)
    assert.ok(fs.existsSync(path.join(paths.out, "img", "logo.png")))
  })

  test("the 404 page works at any depth: styles inline, the start page found by probing", t => {
    const paths = fixture(t, { "index.md": "# Home" }, { title: "Docs", sections: [{ title: "All", pages: ["index.md"] }] })
    fs.writeFileSync(path.join(paths.assets, "style.css"), ".marker{}")
    new DocsBuilder(paths, renderer).build()
    const page = fs.readFileSync(path.join(paths.out, "404.html"), "utf8")
    assert.match(page, /<style>\.marker\{\}<\/style>/)
    assert.doesNotMatch(page, /<link rel="stylesheet"/)
    assert.match(page, /search-index\.json/)
  })

  test("includes take markdown only, keep paragraph breaks and leave code blocks alone", t => {
    const paths = fixture(t, {
      "index.md": "# Home\n\n<!--@include: ../README.md-->\n\nAfter\n\n```md\n<!--@include: ../README.md-->\n```",
      "other.md": "# Other\n<!--@include: ../.env-->"
    }, { title: "Docs", sections: [{ title: "All", pages: ["index.md"] }] })
    new DocsBuilder(paths, renderer).build()
    const home = fs.readFileSync(path.join(paths.out, "index.html"), "utf8")
    assert.match(home, /<p>from elsewhere<\/p>\s*<p>After<\/p>/, "the next paragraph stays separate")
    assert.match(home, /<pre[^>]*>[\s\S]*@include: \.\.\/README\.md[\s\S]*<\/pre>/, "shown, not expanded, inside a code block")
    fs.writeFileSync(path.join(paths.content, "nav.json"), JSON.stringify({ title: "Docs", sections: [{ title: "All", pages: ["other.md"] }] }))
    assert.throws(() => new DocsBuilder(paths, renderer).build(), /only markdown files can be included/)
  })

  test("nav.json can't reach outside the content, and the output can't replace the sources", t => {
    const paths = fixture(t, { "index.md": "# Home" }, { title: "Docs", sections: [{ title: "All", pages: ["../README.md"] }] })
    assert.throws(() => new DocsBuilder(paths, renderer).build(), /must stay inside content/)
    assert.throws(() => new DocsBuilder({ ...paths, out: paths.repository }, renderer), /refusing to build into/)
    assert.throws(() => new DocsBuilder({ ...paths, out: path.dirname(paths.content) }, renderer), /refusing to build into/)
  })
})
