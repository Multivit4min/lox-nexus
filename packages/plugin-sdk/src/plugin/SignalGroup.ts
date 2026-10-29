import type { z } from "zod"

/**
 * Marks the param of a sensor or actuator that names the device the signal belongs to, such as a
 * Home Assistant entity or a bridged Matter device: signal lists show the signals with the same
 * value together, as one group. Several marked params form a path ("node ▸ endpoint"), in the
 * order they are declared. It is described as `signalGroup: true`, which the UI reads on
 * top-level params only. Nothing else uses it: wires, history and exports address single signals.
 */
export function signalGroup<T extends z.ZodType<string | number | null | undefined>>(schema: T): T {
  return schema.meta({ signalGroup: true })
}
