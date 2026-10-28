import type { ScriptCallback } from "../run/ScriptGuard.ts"
import type { ScriptRealm } from "../run/ScriptRealm.ts"
import type { Inbox } from "../variables/Inbox.ts"
import type { Outbox } from "../variables/Outbox.ts"
import { VariableTable } from "../variables/VariableTable.ts"
import { JsValues } from "./JsValues.ts"
import type { ScriptStore } from "./ScriptStore.ts"
import { VariableName } from "./VariableName.ts"

/**
 * The script's `nexus` object. The script reaches only its own variables: `set` feeds this
 * instance's sensors, `on` and `get` read what its actuators receive. Wrong arguments throw a
 * TypeError of the script's realm at the line that made the call.
 */
export class NexusApi {
  constructor(
    private readonly outbox: Outbox,
    private readonly inbox: Inbox,
    private readonly store: ScriptStore,
    private readonly realm: ScriptRealm
  ) {}

  build() {
    return Object.freeze({
      set: (name: unknown, value: unknown) => this.set(this.name("set", name), value),
      get: (name: unknown) => this.inbox.get(this.name("get", name)),
      on: (name: unknown, handler: unknown) => this.on(this.name("on", name), handler),
      store: this.store.build()
    })
  }

  private set(name: string, raw: unknown) {
    const converted = JsValues.toValue(raw)
    if (!converted.ok) throw this.realm.typeError(`nexus.set(${VariableName.show(name)}): ${converted.problem}`)
    this.outbox.set(name, converted.value)
  }

  private on(name: string, handler: unknown) {
    if (typeof handler !== "function") throw this.realm.typeError(`nexus.on(${VariableName.show(name)}): the handler must be a function`)
    const off = this.inbox.on(name, handler as ScriptCallback)
    if (!off) throw this.realm.typeError(`nexus.on(${VariableName.show(name)}): the script already uses ${VariableTable.LIMIT} names for nexus.on and nexus.get`)
    return off
  }

  private name(method: string, name: unknown): string {
    if (!VariableName.isValid(name)) throw this.realm.typeError(`nexus.${method}: invalid variable name ${VariableName.show(name)}; use ${VariableName.rule}`)
    return name
  }
}
