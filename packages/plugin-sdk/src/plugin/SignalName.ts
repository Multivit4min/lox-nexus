import type { z } from "zod"

/**
 * Marks the param of a sensor or actuator whose value names the signal, such as a webhook's hook
 * name or a script's variable: the form names a new signal (and so its topic) after what is typed
 * there, until the user names it. Without one a new signal is named after its kind. It is
 * described as `signalName: true`, which the UI reads on top-level params only.
 */
export function signalName<T extends z.ZodType<string | null | undefined>>(schema: T): T {
  return schema.meta({ signalName: true })
}
