import assert from "node:assert/strict"
import { test } from "node:test"
import { CodeHighlighter, type CodeToken } from "./CodeHighlighter.ts"

const highlighter = new CodeHighlighter()
const marked = (tokens: CodeToken[]) => tokens.filter(token => token.kind !== "plain").map(token => [token.kind, token.text])

test("JavaScript: keywords, literals, strings, numbers and comments; the tokens give the text back", () => {
  const code = "// counts\nconst n = nexus.get(\"a/b\") ?? 0x1F /* hex */\nif (n > 1.5e3) return `t ${n}` + 'x' + null"
  const tokens = highlighter.tokens(code, "javascript")
  assert.equal(tokens.map(token => token.text).join(""), code)
  assert.deepEqual(marked(tokens), [
    ["comment", "// counts"], ["keyword", "const"], ["string", "\"a/b\""], ["number", "0x1F"], ["comment", "/* hex */"],
    ["keyword", "if"], ["number", "1.5e3"], ["keyword", "return"], ["string", "`t ${n}`"], ["string", "'x'"], ["literal", "null"]
  ])
})

test("names that contain keywords or digits stay plain, and quotes inside comments don't start strings", () => {
  assert.deepEqual(marked(highlighter.tokens("const iffy = value2 // it's", "javascript")), [["keyword", "const"], ["comment", "// it's"]])
})

test("an unterminated string ends at its line, an unterminated comment at the end", () => {
  assert.deepEqual(marked(highlighter.tokens("let s = \"open\nlet t", "javascript")), [["keyword", "let"], ["string", "\"open"], ["keyword", "let"]])
  assert.deepEqual(marked(highlighter.tokens("/* open\nlet t", "javascript")), [["comment", "/* open\nlet t"]])
})

test("JSON: keys apart from string values, numbers and literals", () => {
  const tokens = highlighter.tokens("{ \"on\" : true, \"level\": -2.5, \"name\": \"x:y\", \"none\": null }", "json")
  assert.deepEqual(marked(tokens), [
    ["property", "\"on\""], ["literal", "true"], ["property", "\"level\""], ["number", "-2.5"],
    ["property", "\"name\""], ["string", "\"x:y\""], ["property", "\"none\""], ["literal", "null"]
  ])
})

test("text is one plain token, and plain runs are merged", () => {
  assert.deepEqual(highlighter.tokens("const x", "text"), [{ text: "const x", kind: "plain" }])
  assert.deepEqual(highlighter.tokens("", "text"), [])
  assert.deepEqual(highlighter.tokens("a + b", "javascript"), [{ text: "a + b", kind: "plain" }])
})
