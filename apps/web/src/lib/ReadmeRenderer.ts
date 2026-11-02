import MarkdownItFactory, { type MarkdownIt } from "markdown-it"

/**
 * Markdown from elsewhere as HTML for the admin UI: a plugin's README on the Installed page, and
 * Nexus's changelog from GitHub on the System page. Raw HTML is escaped (`html: false`) and
 * markdown-it's link check drops `javascript:` and similar URLs. Links open in a new tab; images
 * show their alt text, so nothing is loaded from other hosts. With a `base`, relative links point
 * there (the repository at a release) instead of into Nexus, where they would lead nowhere.
 */
export class ReadmeRenderer {
  private readonly md: MarkdownIt

  constructor(private readonly base?: string) {
    this.md = new MarkdownItFactory({ html: false, linkify: true })
    const rules = this.md.renderer.rules
    const link = rules.link_open
    rules.link_open = (tokens, index, options, env, self) => {
      const href = String(tokens[index]!.attrGet("href") ?? "")
      if (this.base && href && ReadmeRenderer.relative(href)) tokens[index]!.attrSet("href", new URL(href, this.base).href)
      tokens[index]!.attrSet("target", "_blank")
      tokens[index]!.attrSet("rel", "noopener noreferrer")
      return link ? link(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
    }
    rules.image = (tokens, index) => this.md.utils.escapeHtml(tokens[index]!.content)
  }

  render(markdown: string): string {
    return this.md.render(markdown)
  }

  // no scheme, not protocol-relative, not an anchor on the same page
  private static relative(href: string) {
    return !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//") && !href.startsWith("#")
  }
}
