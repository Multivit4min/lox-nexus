import type { RenderedPage } from "./MarkdownRenderer.ts"
import { SitePath } from "./SitePath.ts"

/**
 * Finds links that would break: to pages or anchors the build doesn't produce, and absolute
 * ones ("/docs/…"), which only work at one base path.
 */
export class LinkChecker {
  /** @param pages rendered pages by markdown source; @param files every other file in the build (assets), as site paths */
  check(pages: Map<string, RenderedPage>, files: Set<string> = new Set()): string[] {
    const ids = new Map([...pages].map(([source, page]) => [SitePath.page(source), page.ids]))
    const problems: string[] = []
    for (const [source, page] of pages) {
      for (const href of page.links) {
        const problem = this.problem(source, href, ids, files, page)
        if (problem) problems.push(`${source}: ${problem}`)
      }
    }
    return problems
  }

  private problem(source: string, href: string, ids: Map<string, Set<string>>, files: Set<string>, page: RenderedPage) {
    if (href.startsWith("/")) return `absolute link ${href} only works at one base path; make it relative`
    if (href.startsWith("#")) return page.ids.has(href.slice(1)) ? undefined : `no heading for ${href}`
    const target = SitePath.resolve(source, href)
    if (!target) return undefined
    const anchors = ids.get(target.path)
    if (!anchors) return files.has(target.path) ? undefined : `${href} doesn't lead to a page of the site`
    return target.anchor === "" || anchors.has(target.anchor) ? undefined : `${href}: the page has no heading #${target.anchor}`
  }
}
