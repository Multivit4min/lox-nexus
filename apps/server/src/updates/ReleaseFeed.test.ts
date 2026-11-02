import assert from "node:assert/strict"
import { test } from "node:test"
import { ReleaseFeed } from "./ReleaseFeed.ts"

const release = (tag: string, extra: object = {}) => ({
  tag_name: tag, html_url: "javascript:alert(1)", draft: false, prerelease: false, published_at: "2026-11-15T10:00:00Z", ...extra
})

/** a fetch that answers from a table and records what was asked */
const fake = (answer: (url: string) => Response | Promise<Response>) => {
  const asked: { url: string; headers: Record<string, string> }[] = []
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    asked.push({ url: String(input), headers: init?.headers as Record<string, string> })
    return answer(String(input))
  }) as typeof fetch
  return { feed: new ReleaseFeed(fetcher), asked }
}

test("latest is the highest stable release; drafts, pre-releases, odd tags and odd entries don't count", async () => {
  const { feed, asked } = fake(() => Response.json([
    release("v0.9.0"), release("v0.10.0"), release("v0.11.0", { draft: true }), release("v0.12.0-beta.1", { prerelease: true }),
    release("0.7.2"), release("nightly"), release("v0.13.0/../../x"), { tag_name: 14 }, "nonsense"
  ]))
  assert.deepEqual(await feed.latest(), {
    version: "0.10.0", tag: "v0.10.0", publishedAt: Date.parse("2026-11-15T10:00:00Z"),
    // built from the tag: the answer's own html_url ("javascript:…" here) never reaches the page
    url: "https://github.com/Multivit4min/lox-nexus/releases/tag/v0.10.0", filesUrl: "https://github.com/Multivit4min/lox-nexus/blob/v0.10.0/"
  })
  assert.equal(asked[0]?.url, "https://api.github.com/repos/Multivit4min/lox-nexus/releases?per_page=30")
  assert.equal(asked[0]?.headers["user-agent"], "lox-nexus", "GitHub refuses requests without one; it says nothing about the installation")
})

test("no stable release at all is undefined; the changelog is read at the release's tag", async () => {
  const { feed, asked } = fake(url => (url.includes("api.github.com") ? Response.json([release("v1.0.0-rc.1", { prerelease: true })]) : new Response("# Changelog")))
  assert.equal(await feed.latest(), undefined)
  assert.equal(await feed.changelog({ tag: "v0.9.0" }), "# Changelog")
  assert.equal(asked[1]?.url, "https://raw.githubusercontent.com/Multivit4min/lox-nexus/v0.9.0/CHANGELOG.md")
})

test("failures say what happened in words", async () => {
  await assert.rejects(fake(() => new Response("{}", { status: 403 })).feed.latest(), /GitHub limits how often/)
  await assert.rejects(fake(() => new Response("", { status: 500, statusText: "Internal Server Error" })).feed.latest(), /GitHub answered 500 Internal Server Error/)
  await assert.rejects(fake(() => Promise.reject(new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND api.github.com") }))).feed.latest(),
    /can't reach GitHub: getaddrinfo ENOTFOUND/)
  await assert.rejects(fake(() => Response.json({ message: "Not Found" })).feed.latest(), /^Error: GitHub's answer isn't a list of releases$/)
})

test("an answer past the size cap is cut off while it arrives, also without a length up front", async () => {
  let sent = 0
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 64 * 1024
      controller.enqueue(new Uint8Array(64 * 1024).fill(120))
    }
  })
  await assert.rejects(fake(() => new Response(endless)).feed.changelog({ tag: "v1.0.0" }), /too large/)
  assert.ok(sent < ReleaseFeed.MAX_BYTES + 256 * 1024, `read ${sent} bytes of an endless answer`)
  await assert.rejects(fake(() => new Response("x", { headers: { "content-length": String(ReleaseFeed.MAX_BYTES + 1) } })).feed.changelog({ tag: "v1.0.0" }), /too large/)
})
