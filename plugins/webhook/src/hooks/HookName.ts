import { signalGroup, signalName, z } from "@lox-nexus/plugin-sdk"

/** The last URL segment that selects a hook: /hook/<instance>/<name>. */
export class HookName {
  static readonly MAX_LENGTH = 64
  static readonly pattern = /^[a-z0-9][a-z0-9._-]*$/

  // a new signal is named after its hook, and so is its topic; signal lists group a hook's signals
  static readonly schema = signalGroup(signalName(z.string()
    .max(HookName.MAX_LENGTH)
    .regex(HookName.pattern, "lowercase letters, digits, '.', '_' and '-', starting with a letter or digit")))
    .meta({
      title: "Hook name",
      description: "The last part of the URL /hook/<instance>/<name>; signals with the same hook name share each call"
    })

  static isValid(name: string) {
    return name.length <= HookName.MAX_LENGTH && HookName.pattern.test(name)
  }

  /** the hook name a request path below the instance addresses ("/doorbell" or "/doorbell/"), if it is one */
  static fromPath(path: string): string | undefined {
    const name = path.replace(/^\//, "").replace(/\/$/, "")
    return HookName.isValid(name) ? name : undefined
  }
}
