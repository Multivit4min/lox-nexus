import type { PluginSignalDto } from "@lox-nexus/api"
import type { PluginDescription } from "@lox-nexus/plugin-sdk/wire"

/** A row of a plugin's signal list: a group header, or a signal (inside a group or not). */
export type SignalListRow =
  | { type: "group"; key: string; label: string; ids: string[]; open: boolean }
  | { type: "signal"; signal: PluginSignalDto; inGroup: boolean }

/**
 * Groups a plugin's signals by the params its capabilities marked with the SDK's signalGroup(),
 * such as a Home Assistant entity or a bridged Matter device. Derived from the params alone, so it
 * works for stopped instances and existing signals; nothing is stored.
 */
export class SignalGroups {
  static readonly SEPARATOR = " ▸ "
  private readonly marked = new Map<string, string[]>()

  constructor(description: PluginDescription) {
    for (const [kind, list] of [["sensor", description.sensors], ["actuator", description.actuators]] as const) {
      for (const capability of list) {
        const properties = (capability.params.properties ?? {}) as Record<string, { signalGroup?: unknown }>
        const names = Object.keys(properties).filter(name => properties[name]?.signalGroup === true)
        if (names.length > 0) this.marked.set(`${kind}:${capability.id}`, names)
      }
    }
  }

  /** the group of a signal, e.g. "light.kitchen"; undefined when its capability marks none or the params are empty */
  of(signal: PluginSignalDto): string | undefined {
    const names = this.marked.get(`${signal.kind}:${signal.capability}`)
    const params = (signal.params ?? {}) as Record<string, unknown>
    const parts = (names ?? []).map(name => params[name]).filter(value => value !== undefined && value !== null && value !== "").map(String)
    return parts.length > 0 ? parts.join(SignalGroups.SEPARATOR) : undefined
  }

  /**
   * The rows to show: a group of two or more signals as a header at its first member's place, with
   * its members below unless collapsed; single and ungrouped signals as plain rows.
   */
  rows(signals: readonly PluginSignalDto[], collapsed: ReadonlySet<string>): SignalListRow[] {
    const members = new Map<string, PluginSignalDto[]>()
    for (const signal of signals) {
      const group = this.of(signal)
      if (group !== undefined) members.set(group, [...(members.get(group) ?? []), signal])
    }
    const rows: SignalListRow[] = []
    const placed = new Set<string>()
    for (const signal of signals) {
      const group = this.of(signal)
      const list = group === undefined ? undefined : members.get(group)
      if (group === undefined || !list || list.length < 2) {
        rows.push({ type: "signal", signal, inGroup: false })
      } else if (!placed.has(group)) {
        placed.add(group)
        const open = !collapsed.has(group)
        rows.push({ type: "group", key: group, label: group, ids: list.map(member => member.id), open })
        if (open) rows.push(...list.map(member => ({ type: "signal" as const, signal: member, inGroup: true })))
      }
    }
    return rows
  }
}
