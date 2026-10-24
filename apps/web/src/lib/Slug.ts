/** Topic segments from names: lowercase letters, digits, '.', '_' and '-', as the API requires. */
export class Slug {
  /** "Fronius Keller" → "fronius-keller", "Wärme" → "warme"; may be empty for names without letters or digits */
  static from(name: string) {
    return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|-+$/g, "")
  }
}
