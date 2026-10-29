type Segment = string | number

/** found with its value, or not there */
export type Resolved = { found: true; value: unknown } | { found: false }

/**
 * A path into parsed JSON such as `state.temperature` or `sensors[0].value`: names separated by
 * dots, array indexes in brackets (or as a numeric name, `sensors.0`). The empty path is the whole
 * document. Names reaching the prototype chain are refused, and only own properties are followed.
 */
export class JsonPath {
  static readonly MAX_LENGTH = 200
  private static readonly forbidden: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"])
  private static readonly first = /^(?:([^.[\]]+)|\[(\d{1,9})\])/
  private static readonly next = /^(?:\.([^.[\]]+)|\[(\d{1,9})\])/

  private constructor(readonly text: string, private readonly segments: readonly Segment[]) {}

  /** @throws Error with a short reason for a malformed path */
  static parse(text: string): JsonPath {
    if (text.length > JsonPath.MAX_LENGTH) throw new Error(`the path is longer than ${JsonPath.MAX_LENGTH} characters`)
    const segments: Segment[] = []
    let rest = text
    while (rest.length > 0) {
      const match = (segments.length === 0 ? JsonPath.first : JsonPath.next).exec(rest)
      if (!match) throw new Error(`can't read the path at "${rest}"`)
      const [whole, name, index] = match
      if (name !== undefined && JsonPath.forbidden.has(name)) throw new Error(`"${name}" isn't allowed in a path`)
      segments.push(name ?? Number(index))
      rest = rest.slice(whole.length)
    }
    return new JsonPath(text, segments)
  }

  /** why a path can't be parsed, or undefined (for params validation) */
  static problem(text: string): string | undefined {
    try {
      JsonPath.parse(text)
      return undefined
    } catch (error) {
      return (error as Error).message
    }
  }

  resolve(root: unknown): Resolved {
    let current = root
    for (const segment of this.segments) {
      const step = JsonPath.step(current, segment)
      if (!step.found) return step
      current = step.value
    }
    return { found: true, value: current }
  }

  private static step(current: unknown, segment: Segment): Resolved {
    if (Array.isArray(current)) {
      const index = typeof segment === "number" ? segment : /^\d+$/.test(segment) ? Number(segment) : -1
      return index >= 0 && index < current.length ? { found: true, value: current[index] } : { found: false }
    }
    if (typeof segment !== "string" || typeof current !== "object" || current === null) return { found: false }
    return Object.hasOwn(current, segment) ? { found: true, value: (current as Record<string, unknown>)[segment] } : { found: false }
  }
}
