import vm from "node:vm"

/**
 * The script's own V8 context. Errors the plugin throws at the script are made with the context's
 * own constructors, so `error instanceof TypeError` holds in the script, and objects handed to it
 * are rebuilt with its JSON, so they have its `Object.prototype`.
 *
 * Not a sandbox: code in the context can reach the host's objects through any function it is
 * given. Scripts are trusted code like any plugin.
 */
export class ScriptRealm {
  readonly context: vm.Context = vm.createContext({}, { name: "script" })
  private readonly intrinsics = vm.runInContext("({ Promise, TypeError, JSON, Date })", this.context) as {
    Promise: PromiseConstructor
    TypeError: TypeErrorConstructor
    JSON: JSON
    Date: DateConstructor
  }

  /** the context's Promise; promises of this class were created by the script */
  get Promise(): PromiseConstructor {
    return this.intrinsics.Promise
  }

  /** the context's own Date, before ZonedDate changes it */
  get Date(): DateConstructor {
    return this.intrinsics.Date
  }

  typeError(message: string): Error {
    return new this.intrinsics.TypeError(message)
  }

  /** a deep copy of JSON-compatible data as objects of the script's realm; primitives as they are */
  adopt(value: unknown): unknown {
    if (typeof value !== "object" || value === null) return value
    return this.intrinsics.JSON.parse(JSON.stringify(value))
  }

  /** makes the entries global variables of the script */
  expose(globals: Record<string, unknown>) {
    Object.assign(this.context, globals)
  }
}
