import type { FroniusSnapshot } from "./SolarApiTypes.ts"

/**
 * A dot path into a poll snapshot, e.g. "powerflow.Site.P_PV", "meter.0.PowerReal_P_Sum" or
 * "storage.0.Controller.StateOfCharge_Relative". Numeric segments are device ids (or array
 * indices), so ids such as 0 need no special syntax.
 */
export class SnapshotPath {
  /** the first segment names the endpoint; keys never contain dots or whitespace */
  static readonly pattern = /^(powerflow|meter|storage)(\.[^.\s]+)+$/

  static readonly example = "powerflow.Site.P_PV"

  /** @returns what the path points to, or undefined when any segment is missing */
  static resolve(snapshot: FroniusSnapshot, path: string): unknown {
    let current: unknown = snapshot
    for (const key of path.split(".")) {
      // own properties only, so "constructor" or "__proto__" never resolve to something inherited
      if (typeof current !== "object" || current === null || !Object.hasOwn(current, key)) return undefined
      current = (current as Record<string, unknown>)[key]
    }
    return current
  }

  /** builds a path from segments, e.g. device ids that may be numbers */
  static join(...segments: (string | number)[]) {
    return segments.join(".")
  }
}
