import fs from "node:fs"
import path from "node:path"
import { Includes } from "./Includes.ts"
import { LinkChecker } from "./LinkChecker.ts"
import { MarkdownRenderer, type RenderedPage } from "./MarkdownRenderer.ts"
import { Navigation } from "./Navigation.ts"
import { NotFoundPage } from "./NotFoundPage.ts"
import { PageTemplate } from "./PageTemplate.ts"
import { SitePath } from "./SitePath.ts"

/** Where a build reads from and writes to; all absolute. */
export interface BuildPaths {
  /** markdown pages and nav.json */
  content: string
  /** style.css, search.js */
  assets: string
  /** emptied and filled by the build */
  out: string
  /** includes may reach anything below it, e.g. the plugins' READMEs */
  repository: string
}

/**
 * Builds the static site: every page listed in nav.json rendered into the template, the assets,
 * other files from the content (images), a search index and a 404 page. Fails on broken links, so
 * a published site never has any.
 */
export class DocsBuilder {
  /** @throws Error when `out` would delete the sources: it equals or contains the content, the assets or the repository */
  constructor(private readonly paths: BuildPaths, private readonly renderer: MarkdownRenderer) {
    const out = path.resolve(paths.out)
    for (const source of [paths.content, paths.assets, paths.repository]) {
      const resolved = path.resolve(source)
      if (resolved === out || resolved.startsWith(out + path.sep)) throw new Error(`refusing to build into ${out}: it would delete ${resolved}`)
    }
  }

  /**
   * @returns the number of pages written
   * @throws Error listing every broken link, or for a missing page or include
   */
  build() {
    const nav = Navigation.load(this.paths.content)
    const includes = new Includes(this.paths.repository)
    const pages = new Map<string, RenderedPage>()
    for (const source of nav.pages) {
      const file = path.join(this.paths.content, source)
      pages.set(source, this.renderer.render(includes.expand(fs.readFileSync(file, "utf8"), file), source))
    }
    const assets = fs.readdirSync(this.paths.assets).map(name => `assets/${name}`)
    const problems = new LinkChecker().check(pages, new Set([...assets, ...this.contentFiles()]))
    if (problems.length > 0) throw new Error(`broken links:\n${problems.join("\n")}`)
    this.write(nav, pages)
    return pages.size
  }

  private write(nav: Navigation, pages: Map<string, RenderedPage>) {
    const out = this.paths.out
    fs.rmSync(out, { recursive: true, force: true })
    fs.mkdirSync(out, { recursive: true })
    fs.cpSync(this.paths.assets, path.join(out, "assets"), { recursive: true })
    for (const file of this.contentFiles()) {
      fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true })
      fs.copyFileSync(path.join(this.paths.content, file), path.join(out, file))
    }
    const titles = new Map([...pages].map(([source, page]) => [source, page.title]))
    const template = new PageTemplate()
    for (const [source, page] of pages) {
      const target = path.join(out, SitePath.page(source))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, template.render(page, { nav, titles, source }))
    }
    const css = fs.readFileSync(path.join(this.paths.assets, "style.css"), "utf8")
    fs.writeFileSync(path.join(out, "404.html"), new NotFoundPage(nav.title, css).render())
    const index = [...pages].map(([source, page]) => ({ url: SitePath.page(source), title: page.title, headings: page.headings.map(h => h.text), text: page.text }))
    fs.writeFileSync(path.join(out, "search-index.json"), JSON.stringify(index))
  }

  /** what the content holds besides pages (images, downloads), as site paths; dotfiles are left out */
  private contentFiles() {
    return fs.readdirSync(this.paths.content, { recursive: true, encoding: "utf8" })
      .map(file => file.split(path.sep).join("/"))
      .filter(file => !/\.md$|^nav\.json$/.test(file) && !file.split("/").some(segment => segment.startsWith(".")))
      .filter(file => fs.statSync(path.join(this.paths.content, file)).isFile())
  }
}
