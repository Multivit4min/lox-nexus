import { Disposable, type PluginLogger } from "@lox-nexus/plugin-sdk"
import type { Agenda } from "../agenda/Agenda.ts"
import type { IcsReader, ReadResult } from "../ics/IcsReader.ts"
import type { FeedClient } from "./FeedClient.ts"

/** called when reading starts failing (with the reason), fails differently, or works again (undefined) */
export type ProblemReport = (problem: string | undefined) => void

/**
 * Reads the feed into the agenda. A failed read keeps the last good calendar, so sensors carry on
 * with what they know. A refresh requested while one runs joins it instead of starting another.
 */
export class CalendarSource extends Disposable {
  lastSuccess: Date | undefined
  /** the last failure; kept after recovery, for the panel */
  lastError: { message: string; at: Date } | undefined
  /** the current reason the feed can't be read */
  problem: string | undefined
  /** events the last read left out entirely, by name */
  skipped: string[] = []
  /** series (or the far future) the last read cut short */
  truncated: string[] = []
  private inFlight: Promise<void> | undefined
  private readonly abort = new AbortController()

  constructor(
    private readonly client: FeedClient,
    private readonly reader: IcsReader,
    private readonly agenda: Agenda,
    private readonly report: ProblemReport,
    private readonly log: PluginLogger
  ) {
    super()
    // waits for the running read, so nothing of it is left once dispose() resolves
    this.onDispose(async () => {
      this.abort.abort()
      await this.inFlight
    })
  }

  /** whether a read is running */
  get reading() {
    return this.inFlight !== undefined
  }

  /** reads once, or joins the read in flight; never rejects */
  refresh(): Promise<void> {
    if (this.isDisposed) return Promise.resolve()
    this.inFlight ??= this.run().finally(() => (this.inFlight = undefined))
    return this.inFlight
  }

  private async run() {
    const read = await this.read()
    if (this.isDisposed) return
    if (read.ok) {
      this.lastSuccess = read.at
      // outside the read's error handling: a sensor's failure is not a problem of the feed
      this.agenda.replace(read.result.occurrences, read.at.getTime())
    } else {
      this.lastError = { message: read.problem, at: new Date() }
    }
    const problem = read.ok ? undefined : read.problem
    // only changes are reported, so a long outage is one status change and one log line
    if (problem === this.problem) return
    this.problem = problem
    this.report(problem)
  }

  private async read(): Promise<{ ok: true; result: ReadResult; at: Date } | { ok: false; problem: string }> {
    try {
      const text = await this.client.fetch(this.abort.signal)
      const at = new Date()
      const result = this.reader.read(text, at)
      this.noteLeftOut(result)
      return { ok: true, result, at }
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error)
      // a feed that answers but isn't a calendar is named by host too: the message may not carry it
      return { ok: false, problem: problem.startsWith(`${this.client.host}:`) ? problem : `${this.client.host}: ${problem}` }
    }
  }

  // logged when the list changes, not on every read
  private noteLeftOut({ skipped, truncated }: ReadResult) {
    if (skipped.join("\n") !== this.skipped.join("\n") && skipped.length > 0) {
      this.log.warn("some events can't be read or repeat too often to expand, and are left out", { events: skipped })
    }
    if (truncated.join("\n") !== this.truncated.join("\n") && truncated.length > 0) {
      this.log.warn("some series repeat so often that only their next occurrences are kept", { series: truncated })
    }
    this.skipped = skipped
    this.truncated = truncated
  }
}
