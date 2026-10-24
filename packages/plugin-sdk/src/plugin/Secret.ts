import type { z } from "zod"

/**
 * Marks a config or params field as secret (a password, a token). It is described as `writeOnly`,
 * so the host never sends it back to a UI and keeps the stored value when an update omits it.
 */
export function secret<T extends z.ZodType>(schema: T): T {
  return schema.meta({ writeOnly: true })
}
