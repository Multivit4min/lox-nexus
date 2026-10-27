import path from "node:path/posix"

/**
 * Paths inside the built site, always relative to its root ("guide/installation.html"). Every
 * link the site contains is relative to the page it is on, so one build works at /docs/ in
 * Nexus, behind a proxy that adds a prefix, and on GitHub or GitLab Pages, without a base setting.
 */
export class SitePath {
  /** the page a markdown source becomes: "guide/installation.md" → "guide/installation.html" */
  static page(source: string) {
    return source.replace(/\.md$/, ".html")
  }

  /** the link from one page to another site path, e.g. ("guide/a.html", "plugins/b.html") → "../plugins/b.html" */
  static link(from: string, to: string) {
    const relative = path.relative(path.dirname(from), to)
    return relative === "" ? path.basename(to) : relative
  }

  /** the site root as seen from a page: "./" or "../../" */
  static root(from: string) {
    const depth = from.split("/").length - 1
    return depth === 0 ? "./" : "../".repeat(depth)
  }

  /**
   * Resolves a link written in a page's markdown to a site path and anchor. External links,
   * mailto: and pure anchors give undefined. A `.md` target becomes its `.html` page.
   */
  static resolve(fromSource: string, href: string): { path: string; anchor: string } | undefined {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return undefined
    const [target = "", anchor = ""] = href.split("#")
    const joined = path.normalize(path.join(path.dirname(fromSource), target))
    const page = joined.endsWith("/") || target === "" ? `${joined}index.html` : SitePath.page(joined)
    return { path: page, anchor }
  }
}
