/** The next change of a schedule: when, for a window whether it then turns on or off, for steps what it sends. */
export interface NextChange {
  at: number
  /** the value a step sends then, as text: "21", "\"night\"" */
  value?: string
  /** "on" or "off" for a window; undefined for a run */
  turns?: "on" | "off"
}

/**
 * A running schedule as the panel, the catalog, the actions and the actuators see it. Each
 * schedule sensor is one, registered in Schedules while it runs.
 */
export interface ScheduleView {
  /** stable across restarts and edits: the signal's id */
  readonly key: string
  /** the signal's name */
  readonly name: string
  /** "Pulse", "Window", … */
  readonly kind: string
  readonly group: string
  /** the trigger in words: "06:30 Mon–Fri", "cron 0 7 * * 1-5" */
  readonly summary: string
  /** whether Run now can fire it; a next-run sensor has nothing to run */
  readonly canRun: boolean
  /** why it is off ("group \"presence\" is off"), or undefined while it is enabled */
  offReason(): string | undefined
  /** whether its next run (or current window) is skipped */
  skipping(now: number): boolean
  /** a window's state now; undefined for the other kinds */
  isOn(now: number): boolean | undefined
  /** what happens next while it is enabled, skips left out */
  next(now: number): NextChange | undefined
  /** when it last ran (a window: last switched on; steps: the latest step that passed), if known */
  lastRun(now: number): number | undefined
  /** the next `count` runs as lines of text, in the zone, skips marked; for the Next runs action */
  upcoming(now: number, count: number): string[]
  /** fires it once now, as a test; @returns what happened; @throws when it can't (switched off, a next-run sensor) */
  runNow(now: number): string
  /** @returns whether it was not skipped already; @throws when there is no next run */
  skipNext(now: number): boolean
  /** @returns whether a skip was cancelled */
  cancelSkip(): boolean
}
