/** Search for long lists: every word of the query must appear in one of the fields, case-insensitively. */
export class TextFilter {
  private readonly terms: string[]

  constructor(query: string) {
    this.terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  }

  get isEmpty() {
    return this.terms.length === 0
  }

  matches(...fields: Array<string | undefined>) {
    if (this.isEmpty) return true
    const haystack = fields.filter(Boolean).join("\n").toLowerCase()
    return this.terms.every(term => haystack.includes(term))
  }
}
