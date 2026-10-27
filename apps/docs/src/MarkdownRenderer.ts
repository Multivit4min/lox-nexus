import MarkdownItFactory, { type MarkdownIt, type Token } from "markdown-it"
import { createHighlighter, type Highlighter } from "shiki"
import { SitePath } from "./SitePath.ts"

export interface Heading {
  level: number
  id: string
  text: string
}

/** One markdown page turned into HTML, plus what navigation, search and the link check need. */
export interface RenderedPage {
  /** the first level-1 heading, or the file name */
  title: string
  html: string
  /** level 2 and 3, for the page's table of contents */
  headings: Heading[]
  /** every id on the page, for checking anchors that link here */
  ids: Set<string>
  /** the plain text, for search */
  text: string
  /** every href as written, for the link check */
  links: string[]
}

const LANGUAGES = ["ts", "js", "json", "bash", "sh", "yaml", "vue", "html", "css", "text", "diff", "ini"]

/**
 * Markdown → HTML with highlighted code (Shiki, light and dark colours in one output), ids on
 * headings, and links to `.md` files turned into links to their `.html` pages.
 */
export class MarkdownRenderer {
  private readonly md: MarkdownIt

  private constructor(private readonly highlighter: Highlighter) {
    this.md = new MarkdownItFactory({ html: true, linkify: true, highlight: (code, lang) => this.highlight(code, lang) })
  }

  static async create() {
    return new MarkdownRenderer(await createHighlighter({ themes: ["github-light", "github-dark"], langs: LANGUAGES }))
  }

  /** @param source the markdown, includes already expanded; @param sourcePath relative to the content root */
  render(source: string, sourcePath: string): RenderedPage {
    const tokens = this.md.parse(source, {})
    const page = { headings: [] as Heading[], ids: new Set<string>(), links: [] as string[], title: undefined as string | undefined }
    tokens.forEach((token, index) => {
      if (token.type === "heading_open") this.heading(token, tokens[index + 1], page)
      // raw HTML anchors (TypeDoc's `<a id="…">`) are link targets, and its links must be checked too
      if (token.type === "html_block") MarkdownRenderer.html(token.content, page)
      for (const child of token.children ?? []) {
        if (child.type === "html_inline") MarkdownRenderer.html(child.content, page)
        if (child.type === "image") page.links.push(String(child.attrGet("src") ?? ""))
        if (child.type !== "link_open") continue
        const href = String(child.attrGet("href") ?? "")
        page.links.push(href)
        if (SitePath.resolve(sourcePath, href)) child.attrSet("href", href.replace(/\.md(#|$)/, ".html$1"))
      }
    })
    const html = this.md.renderer.render(tokens, this.md.options, {})
    const text = MarkdownRenderer.decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
    return { title: page.title ?? sourcePath, html, headings: page.headings, ids: page.ids, text, links: page.links }
  }

  /** the heading's text as shown (no markdown syntax) gives its id, TOC entry and the page title */
  private heading(token: Token, inline: Token | undefined, page: { headings: Heading[]; ids: Set<string>; title: string | undefined }) {
    const text = (inline?.children ?? []).filter(child => child.type === "text" || child.type === "code_inline").map(child => child.content).join("")
    const id = MarkdownRenderer.uniqueId(MarkdownRenderer.slug(text), page.ids)
    token.attrSet("id", id)
    const level = Number(token.tag.slice(1))
    if (level === 1) page.title ??= text
    if (level === 2 || level === 3) page.headings.push({ level, id, text })
  }

  private static html(html: string, page: { ids: Set<string>; links: string[] }) {
    for (const match of html.matchAll(/\bid="([^"]+)"/g)) page.ids.add(match[1]!)
    for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) page.links.push(match[1]!)
  }

  private static decode(text: string) {
    const entities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&amp;": "&" }
    return text.replace(/&(?:lt|gt|quot|#39|amp);/g, entity => entities[entity] ?? entity)
  }

  /** GitHub-style: lowercase, punctuation dropped, spaces to dashes */
  static slug(text: string) {
    return text.toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-")
  }

  private static uniqueId(slug: string, ids: Set<string>) {
    let id = slug || "section"
    for (let n = 1; ids.has(id); n++) id = `${slug}-${n}`
    ids.add(id)
    return id
  }

  private highlight(code: string, lang: string) {
    const language = LANGUAGES.includes(lang) ? lang : "text"
    return this.highlighter.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false })
  }
}
