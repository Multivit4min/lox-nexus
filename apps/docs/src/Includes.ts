import fs from "node:fs"
import path from "node:path"

/**
 * Expands `<!--@include: path-->` lines, so text that lives elsewhere (the plugins' READMEs) is
 * shown on the site without a copy that could drift. Paths are relative to the including file
 * and must stay inside the repository.
 */
export class Includes {
  static readonly MAX_DEPTH = 3
  // [^\S\n]: trailing spaces only, so the blank line after the directive stays a paragraph break
  private static readonly DIRECTIVE = /^<!--\s*@include:\s*(.+?)\s*-->[^\S\n]*$/gm

  constructor(private readonly repositoryRoot: string) {}

  /**
   * Only markdown files can be included, so a typo can't publish `.env` or similar. Directives
   * inside fenced code blocks are left alone, so the syntax itself can be shown.
   * @param file absolute path of the markdown file `source` was read from
   * @throws Error for a missing or non-markdown file, a path outside the repository (also through
   * a symlink) or includes nested too deep
   */
  expand(source: string, file: string, depth = 0): string {
    return source.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[^\S\n]*$)/m).map((part, index) =>
      index % 2 === 1 ? part : part.replace(Includes.DIRECTIVE, (_line, target: string) => this.include(file, target, depth))
    ).join("")
  }

  private include(file: string, target: string, depth: number) {
    if (depth >= Includes.MAX_DEPTH) throw new Error(`${file}: includes nested deeper than ${Includes.MAX_DEPTH}`)
    const included = path.resolve(path.dirname(file), target)
    if (!included.endsWith(".md")) throw new Error(`${file}: only markdown files can be included, not ${target}`)
    if (!fs.existsSync(included)) throw new Error(`${file}: included file ${target} doesn't exist`)
    const real = fs.realpathSync(included)
    if (!real.startsWith(fs.realpathSync(this.repositoryRoot) + path.sep)) throw new Error(`${file}: ${target} is outside the repository`)
    return this.expand(fs.readFileSync(real, "utf8"), included, depth + 1)
  }
}
