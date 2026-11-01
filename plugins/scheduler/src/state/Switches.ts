import { z, type PluginStore } from "@lox-nexus/plugin-sdk"

const storedSchema = z.array(z.string())

/**
 * Which schedules are switched off, by the Enabled actuators and the panel's switches: the
 * whole instance (target "") or a group. A schedule runs only while neither is off. Persisted, so
 * a restart keeps a holiday's "off".
 */
export class Switches {
  static readonly STORE_KEY = "disabled"
  private readonly disabled: Set<string>

  constructor(private readonly store: PluginStore, private readonly changed: () => void) {
    // whatever an older version or a broken write left is dropped rather than trusted
    const stored = storedSchema.safeParse(store.get(Switches.STORE_KEY) ?? [])
    this.disabled = new Set(stored.success ? stored.data : [])
  }

  /** whether a target ("" for all schedules, else a group) is switched on itself */
  isOn(target: string) {
    return !this.disabled.has(target)
  }

  /** why a schedule of `group` is off, or undefined while it is on */
  offReason(group: string): string | undefined {
    if (this.disabled.has("")) return "all schedules are off"
    if (group !== "" && this.disabled.has(group)) return `group "${group}" is off`
    return undefined
  }

  /** the groups switched off, for the panel */
  get offGroups() {
    return [...this.disabled].filter(target => target !== "")
  }

  /** @returns whether it changed */
  set(target: string, on: boolean) {
    if (this.isOn(target) === on) return false
    if (on) this.disabled.delete(target)
    else this.disabled.add(target)
    if (this.disabled.size === 0) this.store.delete(Switches.STORE_KEY)
    else this.store.set(Switches.STORE_KEY, [...this.disabled].sort())
    this.changed()
    return true
  }
}
