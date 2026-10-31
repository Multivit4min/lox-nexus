import type { Tone } from "@lox-nexus/plugin-sdk/wire"

/** How a tone looks: a coloured dot next to the text in that colour, so it never relies on colour alone. */
export class ToneStyle {
  private static readonly TEXT: Record<Tone, string> = {
    ok: "text-emerald-700 dark:text-emerald-400",
    warn: "text-amber-700 dark:text-amber-400",
    error: "text-red-700 dark:text-red-400",
    info: "text-sky-700 dark:text-sky-400",
    muted: "text-muted-foreground"
  }

  private static readonly DOT: Record<Tone, string> = {
    ok: "bg-emerald-500", warn: "bg-amber-500", error: "bg-red-500", info: "bg-sky-500", muted: "bg-muted-foreground/60"
  }

  private static readonly BOX: Record<Tone, string> = {
    ok: "border-emerald-500/40 bg-emerald-500/5", warn: "border-amber-500/50 bg-amber-500/5", error: "border-red-500/50 bg-red-500/5",
    info: "border-sky-500/40 bg-sky-500/5", muted: "border-border bg-muted/40"
  }

  static text(tone: Tone | undefined) {
    return tone ? ToneStyle.TEXT[tone] : ""
  }

  static dot(tone: Tone) {
    return ToneStyle.DOT[tone]
  }

  static box(tone: Tone) {
    return ToneStyle.BOX[tone]
  }

  /** words for screen readers, where the dot says nothing */
  static label(tone: Tone) {
    return { ok: "fine", warn: "warning", error: "problem", info: "note", muted: "inactive" }[tone]
  }
}
