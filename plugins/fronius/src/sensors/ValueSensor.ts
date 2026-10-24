import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { FroniusPlugin } from "../FroniusPlugin.ts"
import { SnapshotPath } from "../SnapshotPath.ts"
import type { FroniusSnapshot } from "../SolarApiTypes.ts"

const params = z.object({
  path: z.string().regex(SnapshotPath.pattern, "a dot path starting with powerflow, meter or storage")
    .describe(`Dot path into the poll data, e.g. ${SnapshotPath.example}`)
})

/**
 * One value of the poll data, picked by a dot path. Emits after every successful poll; the bus
 * drops repeats. Numbers, strings, booleans and null (an inactive component, e.g. PV at night)
 * pass through. A path that doesn't resolve emits nothing, because the device behind it may just
 * not be there right now (a meter endpoint that failed this time, a battery that was removed).
 */
export class ValueSensor extends Sensor<FroniusPlugin, z.infer<typeof params>> {
  static readonly id = "value"
  static readonly label = "Value"
  static readonly params = params
  static readonly valueType = "any"

  override start() {
    this.listen(this.plugin.poller, "data", (snapshot: FroniusSnapshot) => this.update(snapshot))
    if (this.plugin.poller.latest) this.update(this.plugin.poller.latest)
  }

  private update(snapshot: FroniusSnapshot) {
    const value = ValueSensor.toValue(SnapshotPath.resolve(snapshot, this.params.path))
    if (value) this.emit(value)
  }

  /** objects and arrays aren't a single value, so they give undefined like a missing path */
  private static toValue(raw: unknown): Value | undefined {
    if (raw === null) return Value.null()
    if (typeof raw === "number") return Value.number(raw)
    if (typeof raw === "string") return Value.string(raw)
    if (typeof raw === "boolean") return Value.boolean(raw)
    return undefined
  }
}
