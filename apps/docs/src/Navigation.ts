import fs from "node:fs"
import path from "node:path"
import { z } from "zod"

/** relative and inside the content directory: no "..", no absolute path */
const inside = z.string().min(1).refine(value => !value.startsWith("/") && !value.split(/[\\/]/).includes(".."), "must stay inside content/")
const SectionSchema = z.union([
  z.object({ title: z.string(), pages: z.array(inside.and(z.string().regex(/\.md$/))).min(1) }),
  /** every markdown file of a directory, index first, e.g. the generated SDK reference */
  z.object({ title: z.string(), dir: inside })
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
      pages: "pages" in section ? section.pages : Navigation.listDir(contentDir, section.dir)
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

  private static listDir(contentDir: string, dir: string) {
    const absolute = path.join(contentDir, dir)
    if (!fs.existsSync(absolute)) throw new Error(`nav.json lists the directory ${dir}, which doesn't exist (run npm run reference?)`)
    const files = fs.readdirSync(absolute, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(".md")).sort()
    const ordered = [...files.filter(file => path.basename(file) === "index.md"), ...files.filter(file => path.basename(file) !== "index.md")]
    return ordered.map(file => path.posix.join(dir, file.split(path.sep).join("/")))
  }
}
