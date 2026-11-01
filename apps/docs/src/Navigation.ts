import fs from "node:fs"
import path from "node:path"
import { z } from "zod"

/** relative and inside the content directory: no "..", no absolute path */
const inside = z.string().min(1).refine(value => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."), "must stay inside content/")
const SectionSchema = z.union([
  z.object({ title: z.string(), pages: z.array(inside.and(z.string().regex(/\.md$/))).min(1) }),
  /**
   * every markdown file of a directory, e.g. the generated SDK reference: `first` in its order
   * (relative to `dir`), then the index pages, then the rest by name
   */
  z.object({ title: z.string(), dir: inside, first: z.array(inside).optional() })
])
const NavSchema = z.object({ title: z.string(), sections: z.array(SectionSchema).min(1) })

export interface NavSection {
  title: string
  /** markdown sources relative to the content root, in reading order */
  pages: string[]
}

/**
 * The site's structure from `content/nav.json`: sections of pages in reading order. It lives in
 * the content, not the code, so the pages and their order are edited together.
 */
export class Navigation {
  private constructor(readonly title: string, readonly sections: NavSection[]) {}

  /** @throws Error for an invalid nav.json or a page that doesn't exist */
  static load(contentDir: string) {
    const nav = NavSchema.parse(JSON.parse(fs.readFileSync(path.join(contentDir, "nav.json"), "utf8")))
    const sections = nav.sections.map(section => ({
      title: section.title,
      pages: "pages" in section ? section.pages : Navigation.listDir(contentDir, section.dir, section.first)
    }))
    for (const page of sections.flatMap(section => section.pages)) {
      if (!fs.existsSync(path.join(contentDir, page))) throw new Error(`nav.json lists ${page}, which doesn't exist`)
    }
    return new Navigation(nav.title, sections)
  }

  /** every page in reading order */
  get pages() {
    return this.sections.flatMap(section => section.pages)
  }

  private static listDir(contentDir: string, dir: string, first: string[] = []) {
    const absolute = path.join(contentDir, dir)
    if (!fs.existsSync(absolute)) throw new Error(`nav.json lists the directory ${dir}, which doesn't exist (run npm run reference?)`)
    const files = fs.readdirSync(absolute, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(".md")).map(file => file.split(path.sep).join("/")).sort()
    // a page renamed by the generator must not drop out of the order unnoticed
    const twice = first.filter((file, index) => first.indexOf(file) !== index)
    if (twice.length > 0) throw new Error(`nav.json puts ${twice.join(", ")} first in ${dir} more than once`)
    const unknown = first.filter(file => !files.includes(file))
    if (unknown.length > 0) throw new Error(`nav.json puts ${unknown.join(", ")} first in ${dir}, which doesn't exist there`)
    const rest = files.filter(file => !first.includes(file))
    const ordered = [...first, ...rest.filter(file => path.posix.basename(file) === "index.md"), ...rest.filter(file => path.posix.basename(file) !== "index.md")]
    return ordered.map(file => path.posix.join(dir, file))
  }
}
