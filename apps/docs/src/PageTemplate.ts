import type { Navigation } from "./Navigation.ts"
import type { RenderedPage } from "./MarkdownRenderer.ts"
import { SitePath } from "./SitePath.ts"

/** What a page needs to know about the site around it. */
export interface PageContext {
  nav: Navigation
  /** page titles by markdown source, for the sidebar and prev/next */
  titles: Map<string, string>
  /** this page's markdown source, relative to the content root */
  source: string
}

const escape = (text: string) => text.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[char] ?? char)

/**
 * The HTML around a rendered page: header with search, sidebar, the page with its table of
 * contents, and previous/next links. Every URL is relative to the page (see SitePath).
 */
export class PageTemplate {
  render(page: RenderedPage, context: PageContext) {
    const self = SitePath.page(context.source)
    const root = SitePath.root(self)
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)} · ${escape(context.nav.title)}</title>
<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${root}assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${root}assets/apple-touch-icon.png">
<link rel="stylesheet" href="${root}assets/style.css">
<script src="${root}assets/search.js" defer></script>
</head>
<body data-root="${root}">
<header class="top">
  <button class="menu" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')">☰</button>
  <a class="brand" href="${root}index.html">${escape(context.nav.title)}</a>
  <input class="search" type="search" placeholder="Search" aria-label="Search the docs">
  <ul class="results" hidden></ul>
</header>
<div class="layout">
<nav class="sidebar">${this.sidebar(context, self)}</nav>
<main><article>${page.html}</article>${this.pager(context, self)}</main>
<aside class="toc">${this.toc(page)}</aside>
</div>
</body>
</html>
`
  }

  private sidebar({ nav, titles }: PageContext, self: string) {
    return nav.sections.map(section => {
      const items = section.pages.map(source => {
        const target = SitePath.page(source)
        const current = target === self ? " aria-current=\"page\"" : ""
        return `<li><a href="${SitePath.link(self, target)}"${current}>${escape(titles.get(source) ?? source)}</a></li>`
      })
      return `<h2>${escape(section.title)}</h2><ul>${items.join("")}</ul>`
    }).join("")
  }

  private toc(page: RenderedPage) {
    if (page.headings.length < 2) return ""
    const items = page.headings.map(heading => `<li class="h${heading.level}"><a href="#${heading.id}">${escape(heading.text)}</a></li>`)
    return `<h2>On this page</h2><ul>${items.join("")}</ul>`
  }

  private pager({ nav, titles, source }: PageContext, self: string) {
    const pages = nav.pages
    const index = pages.indexOf(source)
    const link = (target: string | undefined, rel: string, label: string) => target === undefined
      ? "<span></span>"
      : `<a rel="${rel}" href="${SitePath.link(self, SitePath.page(target))}"><small>${label}</small>${escape(titles.get(target) ?? target)}</a>`
    return `<footer class="pager">${link(pages[index - 1], "prev", "Previous")}${link(pages[index + 1], "next", "Next")}</footer>`
  }
}
