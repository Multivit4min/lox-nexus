/**
 * Finds what keeps a script value from being stored as JSON as it is. The plugin store would
 * silently flatten class instances and drop functions; a script should hear about that instead.
 */
export class JsonCheck {
  static readonly MAX_DEPTH = 64

  /** undefined when the value is JSON, else what is wrong and where ("value.list[2] is a function") */
  static problem(value: unknown, path = "value", ancestors: object[] = []): string | undefined {
    switch (typeof value) {
      case "string":
      case "boolean": return undefined
      case "number": return Number.isFinite(value) ? undefined : `${path} is ${value}, not a finite number`
      case "object": return value === null ? undefined : JsonCheck.objectProblem(value, path, ancestors)
      case "undefined": return `${path} is undefined`
      default: return `${path} is a ${typeof value}`
    }
  }

  private static objectProblem(value: object, path: string, ancestors: object[]): string | undefined {
    if (ancestors.includes(value)) return `${path} refers to itself`
    if (ancestors.length >= JsonCheck.MAX_DEPTH) return `${path} is nested deeper than ${JsonCheck.MAX_DEPTH} levels`
    const inner = [...ancestors, value]
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const problem = JsonCheck.problem(value[i], `${path}[${i}]`, inner)
        if (problem) return problem
      }
      return undefined
    }
    if (!JsonCheck.isPlain(value)) return `${path} is a ${Object.prototype.toString.call(value).slice(8, -1)}, not a plain object`
    for (const [key, item] of Object.entries(value)) {
      // JSON leaves undefined fields out, as the store does
      if (item === undefined) continue
      const problem = JsonCheck.problem(item, `${path}.${key}`, inner)
      if (problem) return problem
    }
    return undefined
  }

  /** a plain object of any realm: its prototype is null or an Object.prototype (whose own prototype is null) */
  private static isPlain(value: object) {
    const prototype = Object.getPrototypeOf(value) as object | null
    return prototype === null || Object.getPrototypeOf(prototype) === null
  }
}
