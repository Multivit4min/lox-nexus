import MarkdownItFactory, { type MarkdownIt } from "markdown-it"

/**
 * A plugin's README as HTML for the Installed page. Plugins are trusted code, but their README is
 * shown inside the admin UI, so raw HTML is escaped (`html: false`) and markdown-it's link check
 * drops `javascript:` and similar URLs. Links open in a new tab; images show their alt text, since
 * a README's relative image paths point into its repository, not to anything Nexus serves.
 */
export class ReadmeRenderer {
  private readonly md: MarkdownIt

  constructor() {
    this.md = new MarkdownItFactory({ html: false, linkify: true })
    const rules = this.md.renderer.rules
    const link = rules.link_open
    rules.link_open = (tokens, index, options, env, self) => {
      tokens[index]!.attrSet("target", "_blank")
      tokens[index]!.attrSet("rel", "noopener noreferrer")
      return link ? link(tokens, index, options, env, self) : self.renderToken(tokens, index, options)
    }
    rules.image = (tokens, index) => this.md.utils.escapeHtml(tokens[index]!.content)
  }

  render(markdown: string): string {
    return this.md.render(markdown)
  }
}
