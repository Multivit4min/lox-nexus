/** Picks a topic segment no other signal uses: the base itself, else base-2, base-3, … */
export class FreeSlug {
  static pick(base: string, taken: ReadonlySet<string>) {
    if (!taken.has(base)) return base
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`
      if (!taken.has(candidate)) return candidate
    }
  }
}
