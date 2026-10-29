import type { z } from "zod"

/**
 * Marks a string config field as a random token (a shared secret that callers present, such as a
 * webhook token), so the UI offers a button that fills it with a new one: 24 random bytes as 48 hex
 * characters, which the schema must allow. It is described as `format: "token"`. Leave the field
 * visible so the token can be copied into the caller, or combine it with secret() to hide it.
 */
export function token<T extends z.ZodType<string | null | undefined>>(schema: T): T {
  return schema.meta({ format: "token" })
}
