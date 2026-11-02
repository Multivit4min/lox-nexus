import { VersionChange, type AppChangeDto } from "@lox-nexus/api"

/**
 * Cuts Nexus's CHANGELOG.md into one section per version. Its headings read "## 0.8.0 (2026-10-30)";
 * "## Unreleased" and anything else that isn't a version is skipped.
 */
export class ChangelogSections {
  /** more than this many versions at once is a very old install; it gets the newest */
  static readonly MAX_SECTIONS = 30
  /** a version heading is short; a longer line isn't one, and isn't worth matching */
  private static readonly MAX_HEADING = 100
  // anchored at both ends with no two optional runs of spaces next to each other, so a long line can't make it backtrack
  private static readonly HEADING = /^##\s+v?(\d+\.\d+\.\d+)(?:\s+\((\d{4}-\d{2}-\d{2})\))?$/

  static parse(markdown: string): AppChangeDto[] {
    const sections: AppChangeDto[] = []
    let current: { version: string; date?: string; lines: string[] } | undefined
    const close = () => current && sections.push({ version: current.version, ...(current.date ? { date: current.date } : {}), markdown: current.lines.join("\n").trim() })
    for (const line of markdown.split(/\r?\n/)) {
      if (!line.startsWith("## ")) {
        current?.lines.push(line)
        continue
      }
      close()
      const heading = line.trimEnd()
      const match = heading.length <= ChangelogSections.MAX_HEADING ? ChangelogSections.HEADING.exec(heading) : null
      current = match ? { version: match[1]!, ...(match[2] ? { date: match[2] } : {}), lines: [] } : undefined
    }
    close()
    return sections
  }

  /** the sections after `current` up to and including `latest`, newest first */
  static between(sections: AppChangeDto[], current: string, latest: string): AppChangeDto[] {
    return sections
      .filter(section => VersionChange.compare(section.version, current) > 0 && VersionChange.compare(section.version, latest) <= 0)
      .sort((a, b) => VersionChange.compare(b.version, a.version))
      .slice(0, ChangelogSections.MAX_SECTIONS)
  }
}
