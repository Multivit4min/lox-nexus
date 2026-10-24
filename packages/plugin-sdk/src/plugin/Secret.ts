import type { z } from "zod"

/**
 * Marks a config or params field as secret (a password, a token). It is described as `writeOnly`,
 * so the host never sends it back to a UI and keeps the stored value when an update omits it.
 *
 * Only top-level fields of the instance config are protected. A secret inside a nested object or
 * an array is not detected: its value is sent to the UI, and saving the form erases it.
 */
export function secret<T extends z.ZodType>(schema: T): T {
  return schema.meta({ writeOnly: true })
}
