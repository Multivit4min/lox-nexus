import { z } from "@lox-nexus/plugin-sdk"

/** Names of script variables, shared by `nexus.*` and the params of every sensor and actuator. */
export class VariableName {
  static readonly pattern = /^[A-Za-z0-9_.-]{1,64}$/
  static readonly rule = "1 to 64 letters, digits, \"_\", \".\" or \"-\""
  static readonly schema = z.string().regex(VariableName.pattern, `use ${VariableName.rule}`)

  static isValid(name: unknown): name is string {
    return typeof name === "string" && VariableName.pattern.test(name)
  }

  /** for error messages: the name as the script gave it, shortened */
  static show(name: unknown): string {
    if (typeof name !== "string") return `a ${typeof name}`
    return JSON.stringify(name.length > 70 ? `${name.slice(0, 70)}…` : name)
  }
}
