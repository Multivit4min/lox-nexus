import fs from "node:fs"
import path from "node:path"

/**
 * Expands `<!--@include: path-->` lines, so text that lives elsewhere (the plugins' READMEs) is
 * shown on the site without a copy that could drift, and `<!--@code: path-->` lines into a code
 * block holding a source file, or one `#region` of it, so a tutorial shows the code its tests run.
 * Paths are relative to the including file and must stay inside the repository.
 */
export class Includes {
  static readonly MAX_DEPTH = 3
  // [^\S\n]: trailing spaces only, so the blank line after the directive stays a paragraph break
  private static readonly DIRECTIVE = /^<!--\s*@(include|code):\s*(.+?)\s*-->[^\S\n]*$/gm
  /** what a code block may show, with its language; anything else (`.env`, keys) can't be published by a typo */
  private static readonly CODE: Record<string, string> = { ".ts": "ts", ".js": "js", ".mjs": "js", ".json": "json" }
  // `// #region name` and `// #endregion`, as VS Code folds them
  private static readonly REGION = /^\s*\/\/\s*#(region|endregion)\b\s*(.*?)\s*$/

  constructor(private readonly repositoryRoot: string) {}

  /**
   * Only markdown files can be included, and only source files shown as code, so a typo can't
   * publish `.env` or similar. Directives inside fenced code blocks are left alone, so the syntax
   * itself can be shown.
   * @param file absolute path of the markdown file `source` was read from
   * @throws Error for a missing or unsupported file, a path outside the repository (also through
   * a symlink), an unknown region or includes nested too deep
   */
  expand(source: string, file: string, depth = 0): string {
    return source.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[^\S\n]*$)/m).map((part, index) =>
      index % 2 === 1 ? part : part.replace(Includes.DIRECTIVE, (_line, kind: string, target: string) =>
        kind === "code" ? this.code(file, target) : this.include(file, target, depth))
    ).join("")
  }

  private include(file: string, target: string, depth: number) {
    if (depth >= Includes.MAX_DEPTH) throw new Error(`${file}: includes nested deeper than ${Includes.MAX_DEPTH}`)
    if (!target.endsWith(".md")) throw new Error(`${file}: only markdown files can be included, not ${target}`)
    const { included, real } = this.resolve(file, target)
    // the file read, not the link's name, must be markdown: `notes.md -> ../.env` is refused
    if (!real.endsWith(".md")) throw new Error(`${file}: ${target} leads to ${path.basename(real)}, which isn't markdown`)
    return this.expand(fs.readFileSync(real, "utf8"), included, depth + 1)
  }

  private code(file: string, target: string) {
    const [relative = "", region] = target.split("#", 2)
    const language = Includes.CODE[path.extname(relative)]
    if (!language) throw new Error(`${file}: only ${Object.keys(Includes.CODE).join(", ")} files can be shown as code, not ${relative}`)
    const { real } = this.resolve(file, relative)
    if (Includes.CODE[path.extname(real)] !== language) throw new Error(`${file}: ${relative} leads to ${path.basename(real)}, which can't be shown as ${language}`)
    const lines = fs.readFileSync(real, "utf8").replace(/\n+$/, "").split("\n")
    const shown = region ? Includes.region(lines, region, `${file}: ${relative}`) : lines
    // a fence longer than any backtick run inside, so code that holds ``` can't end the block
    const longest = Math.max(0, ...shown.flatMap(line => line.match(/`+/g) ?? []).map(run => run.length))
    const fence = "`".repeat(Math.max(3, longest + 1))
    return `${fence}${language}\n${shown.filter(line => !Includes.REGION.test(line)).join("\n")}\n${fence}`
  }

  // the lines between `// #region name` and its `// #endregion`, less the common indentation
  private static region(lines: string[], name: string, where: string) {
    const start = lines.findIndex(line => Includes.REGION.exec(line)?.slice(1, 3).join(" ") === `region ${name}`)
    if (start < 0) throw new Error(`${where} has no "// #region ${name}"`)
    let depth = 0
    const end = lines.findIndex((line, index) => {
      if (index <= start) return false
      const marker = Includes.REGION.exec(line)?.[1]
      depth += marker === "region" ? 1 : marker === "endregion" ? -1 : 0
      return depth < 0
    })
    if (end < 0) throw new Error(`${where}: "// #region ${name}" has no "// #endregion"`)
    const body = lines.slice(start + 1, end)
    const indent = Math.min(...body.filter(line => line.trim()).map(line => line.length - line.trimStart().length))
    return body.map(line => line.slice(Number.isFinite(indent) ? indent : 0))
  }

  private resolve(file: string, target: string) {
    const included = path.resolve(path.dirname(file), target)
    if (!fs.existsSync(included)) throw new Error(`${file}: included file ${target} doesn't exist`)
    const real = fs.realpathSync(included)
    if (!real.startsWith(fs.realpathSync(this.repositoryRoot) + path.sep)) throw new Error(`${file}: ${target} is outside the repository`)
    return { included, real }
  }
}
