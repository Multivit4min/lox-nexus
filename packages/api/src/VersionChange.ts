/** How a staged version relates to the installed one. */
export type VersionChangeKind = "new" | "same" | "rebuild" | "update" | "older"

/**
 * Compares semantic versions the way the review describes them. Pre-releases sort before their
 * release (1.0.0-beta < 1.0.0); build metadata (+…) doesn't change precedence, as semver says, but
 * Nexus stores each version string as its own version, so 1.0.0+a and 1.0.0+b are a "rebuild".
 */
export class VersionChange {
  static of(staged: string, installed: string | undefined): VersionChangeKind {
    if (installed === undefined) return "new"
    if (staged === installed) return "same"
    const order = VersionChange.compare(staged, installed)
    return order === 0 ? "rebuild" : order > 0 ? "update" : "older"
  }

  /** negative, zero or positive like a sort comparator */
  static compare(a: string, b: string) {
    const [coreA = "", preA] = a.split("+")[0]!.split(/-(.*)/s)
    const [coreB = "", preB] = b.split("+")[0]!.split(/-(.*)/s)
    const numbers = (core: string) => core.split(".").map(Number)
    const [x, y] = [numbers(coreA), numbers(coreB)]
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    if (preA === preB) return 0
    if (preA === undefined) return 1
    if (preB === undefined) return -1
    return VersionChange.comparePre(preA, preB)
  }

  // dot-separated identifiers: numbers compare numerically and sort before words
  private static comparePre(a: string, b: string) {
    const [x, y] = [a.split("."), b.split(".")]
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const [p, q] = [x[i], y[i]]
      if (p === undefined) return -1
      if (q === undefined) return 1
      if (p === q) continue
      const [m, n] = [/^\d+$/.test(p), /^\d+$/.test(q)]
      if (m && n) return Number(p) - Number(q)
      if (m !== n) return m ? -1 : 1
      return p < q ? -1 : 1
    }
    return 0
  }
}
