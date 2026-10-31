import { z } from "zod"

/**
 * Config and form fields the UI shows with a fitting input instead of a text box. Each is a plain
 * zod schema with a JSON Schema hint (`format` or `widget`), so hosts and UIs that don't know the
 * hint still show and check it as a number or text. Add `.meta({ title, description })` as usual.
 */

/** a duration stored as a number of `unit`s (default seconds); the form offers seconds, minutes and hours */
export function duration(options: { unit?: "ms" | "s" | "min" | "h"; min?: number; max?: number } = {}) {
  const schema = z.number().min(options.min ?? 0)
  return (options.max === undefined ? schema : schema.max(options.max)).meta({ format: "duration", unit: options.unit ?? "s" })
}

/** a time of day as "HH:MM" (24 h), e.g. "06:30"; the form shows a time picker */
export function timeOfDay() {
  return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "a time as HH:MM, e.g. 06:30").meta({ format: "time" })
}

/** a colour as "#rrggbb"; the form shows a colour picker next to the hex text */
export function color() {
  return z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour as #rrggbb, e.g. #ff8800").meta({ format: "color" })
}

/** a number from `min` to `max`, shown as a slider with the number next to it */
export function slider(min: number, max: number, step = 1) {
  return z.number().min(min).max(max).meta({ widget: "slider", step })
}

/**
 * A file the user picks, e.g. a certificate: its contents as text (default), or as base64 for
 * binary files. `accept` filters the picker (".pem,.crt"); `maxBytes` (default 256 KiB) is checked
 * in the form before upload and again here.
 */
export function file(options: { accept?: string; maxBytes?: number; encoding?: "text" | "base64" } = {}) {
  const maxBytes = options.maxBytes ?? 256 * 1024
  const base64 = options.encoding === "base64"
  // base64 grows by a third; text is counted in characters, which is close enough for a limit
  return z.string().max(base64 ? Math.ceil(maxBytes / 3) * 4 : maxBytes).meta({
    format: "file", maxBytes, ...(options.accept ? { accept: options.accept } : {}), ...(base64 ? { contentEncoding: "base64" } : {})
  })
}

/**
 * Marks a top-level config field as one the plugin can find on the network: the form shows Find
 * next to it, which runs the plugin's `static discover` for the field and offers what it found.
 */
export function discoverable<T extends z.ZodType>(schema: T): T {
  return schema.meta({ ...schema.meta(), discover: true }) as T
}
