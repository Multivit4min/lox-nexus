import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { Topic } from "./Topic.ts"
import { TopicTrie } from "./TopicTrie.ts"

describe("Topic", () => {
  test("validates readable topics", () => {
    assert.ok(Topic.isValid("loxone/haus/in/licht-kueche"))
    for (const bad of ["", "a//b", "Loxone/x", "a/+/b", "a/#", "a b"]) assert.ok(!Topic.isValid(bad), bad)
  })

  test("matches MQTT-style wildcards", () => {
    assert.ok(Topic.matches("loxone/+/in/#", "loxone/haus/in/a/b"))
    assert.ok(Topic.matches("#", "anything/at/all"))
    assert.ok(!Topic.matches("loxone/+", "loxone/haus/in"))
    assert.ok(!Topic.matches("loxone/haus/in", "loxone/haus"))
  })

  test("slugs labels into topic segments", () => {
    assert.equal(Topic.slug("Licht Küche"), "licht-kueche")
    assert.equal(Topic.slug("  Straße / Größe!  "), "strasse-groesse")
    assert.equal(Topic.slug("Café"), "cafe")
    assert.equal(Topic.slug("???"), "unnamed")
  })
})

describe("TopicTrie", () => {
  test("finds exact, + and # subscribers once each", () => {
    const trie = new TopicTrie<string>()
    trie.add("a/b/c", "exact")
    trie.add("a/+/c", "single")
    trie.add("a/#", "multi")
    trie.add("#", "all")
    trie.add("a/b", "other")
    assert.deepEqual(trie.match("a/b/c").sort(), ["all", "exact", "multi", "single"])
    assert.deepEqual(trie.match("a").sort(), ["all", "multi"])
  })

  test("removes items and prunes empty branches", () => {
    const trie = new TopicTrie<string>()
    trie.add("a/b", "x")
    trie.remove("a/b", "x")
    assert.deepEqual(trie.match("a/b"), [])
    assert.equal((trie as unknown as { root: { children: Map<string, unknown> } }).root.children.size, 0)
  })

  test("rejects invalid patterns", () => {
    assert.throws(() => new TopicTrie().add("a/#/b", 1), RangeError)
  })
})
