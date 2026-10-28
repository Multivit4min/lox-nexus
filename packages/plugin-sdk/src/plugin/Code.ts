import type { z } from "zod"

/** Languages the UI knows how to present; others are shown as plain text. */
export type CodeLanguage = "javascript" | "json" | "text"

const MEDIA_TYPES: Record<CodeLanguage, string> = {
  javascript: "text/javascript",
  json: "application/json",
  text: "text/plain"
}

/**
 * Marks a string config field as source code (a script, a template), so the UI edits it in a
 * code editor instead of a one-line input; a field that is also `secret()` stays a masked input.
 * It is described as `format: "code"` with the language's `contentMediaType`. Validating the code
 * stays the plugin's job, e.g. compiling it in start() and throwing with the line and column.
 */
export function code<T extends z.ZodType<string | null | undefined>>(schema: T, language: CodeLanguage = "javascript"): T {
  return schema.meta({ format: "code", contentMediaType: MEDIA_TYPES[language] })
}
