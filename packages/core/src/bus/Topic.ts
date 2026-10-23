/**
 * Topics are slash-separated, readable paths such as "loxone/haus/in/licht-kueche".
 * Patterns may use MQTT wildcards: "+" for one level, "#" (last only) for any number of levels.
 */
export class Topic {
  private static readonly SEGMENT = /^[a-z0-9][a-z0-9._-]*$/

  static isValid(topic: string) {
    return topic.split("/").every(segment => Topic.SEGMENT.test(segment))
  }

  static assertValid(topic: string) {
    if (!Topic.isValid(topic)) throw new RangeError(`invalid topic "${topic}": use lowercase segments of a-z, 0-9, ".", "_" or "-"`)
  }

  static assertValidPattern(pattern: string) {
    const segments = pattern.split("/")
    const valid = segments.every((segment, index) =>
      segment === "+" || (segment === "#" && index === segments.length - 1) || Topic.SEGMENT.test(segment))
    if (!valid) throw new RangeError(`invalid topic pattern "${pattern}"`)
  }

  static matches(pattern: string, topic: string): boolean {
    const p = pattern.split("/")
    const t = topic.split("/")
    for (let i = 0; i < p.length; i++) {
      if (p[i] === "#") return true
      if (i >= t.length || (p[i] !== "+" && p[i] !== t[i])) return false
    }
    return p.length === t.length
  }

  /** turns a label into a topic segment: "Licht Küche" → "licht-kueche" */
  static slug(label: string): string {
    const replaced = label.toLowerCase()
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .normalize("NFKD").replace(/\p{M}/gu, "")
    const slug = replaced.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    return slug || "unnamed"
  }
}
