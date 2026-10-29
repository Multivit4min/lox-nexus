import type { CodeLanguage } from "./SchemaField.ts"

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "literal" | "property"

/** A run of source text and what it is; the runs of one text joined give the text back unchanged. */
export interface CodeToken {
  text: string
  kind: TokenKind
}

const KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else",
  "export", "extends", "finally", "for", "function", "if", "import", "in", "instanceof", "let", "new", "of", "return",
  "static", "super", "switch", "throw", "try", "typeof", "var", "void", "while", "yield"
])
const LITERALS = new Set(["true", "false", "null", "undefined", "this", "NaN", "Infinity"])

// Unterminated comments and strings run to the end (of the text or line), as an editor shows them
// while they are being typed. Regex literals and `${}` inside templates are not recognised.
const JAVASCRIPT = new RegExp([
  String.raw`(?<comment>\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
  String.raw`(?<string>"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|\`(?:[^\`\\]|\\[\s\S])*\`?)`,
  String.raw`(?<number>\b(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)n?\b)`,
  String.raw`(?<word>[A-Za-z_$][\w$]*)`
].join("|"), "g")

const JSON_TOKENS = new RegExp([
  String.raw`(?<property>"(?:[^"\\\n]|\\.)*"(?=\s*:))`,
  String.raw`(?<string>"(?:[^"\\\n]|\\.)*"?)`,
  String.raw`(?<number>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)`,
  String.raw`(?<word>[A-Za-z]+)`
].join("|"), "g")

/**
 * Splits code into tokens for basic highlighting: one pass of a regular expression, no parsing,
 * so it is cheap enough to run on every keystroke. Everything it doesn't recognise stays plain.
 */
export class CodeHighlighter {
  tokens(text: string, language: CodeLanguage): CodeToken[] {
    if (language === "text") return text ? [{ text, kind: "plain" }] : []
    const pattern = language === "json" ? JSON_TOKENS : JAVASCRIPT
    const tokens: CodeToken[] = []
    let at = 0
    for (const match of text.matchAll(pattern)) {
      if (match.index > at) this.push(tokens, text.slice(at, match.index), "plain")
      this.push(tokens, match[0], this.kindOf(match.groups ?? {}, language))
      at = match.index + match[0].length
    }
    if (at < text.length) this.push(tokens, text.slice(at), "plain")
    return tokens
  }

  private kindOf(groups: Record<string, string | undefined>, language: CodeLanguage): TokenKind {
    const word = groups.word
    if (word === undefined) return (["comment", "string", "number", "property"] as const).find(kind => groups[kind] !== undefined) ?? "plain"
    if (language === "json") return ["true", "false", "null"].includes(word) ? "literal" : "plain"
    return KEYWORDS.has(word) ? "keyword" : LITERALS.has(word) ? "literal" : "plain"
  }

  // neighbouring plain runs are merged, so a long script makes few elements
  private push(tokens: CodeToken[], text: string, kind: TokenKind) {
    const last = tokens.at(-1)
    if (last && last.kind === "plain" && kind === "plain") last.text += text
    else tokens.push({ text, kind })
  }
}
