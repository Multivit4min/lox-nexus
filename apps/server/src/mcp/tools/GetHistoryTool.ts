import type { HistorySeriesDto } from "@lox-nexus/api"
import { z } from "zod"
import type { InventoryService } from "../../services/InventoryService.ts"
import { CompactTable } from "../CompactTable.ts"
import type { McpTool } from "../McpTool.ts"

const Input = z.object({
  signal: z.string().min(1).max(300).describe("the signal's topic (or id)"),
  from: z.iso.datetime({ offset: true }).optional().describe("ISO 8601; default: `hours` before `to`"),
  to: z.iso.datetime({ offset: true }).optional().describe("ISO 8601; default: now"),
  hours: z.number().min(0.1).max(24 * 3650).default(24).describe("the range when `from` isn't given"),
  points: z.number().int().min(10).max(500).default(100).describe("about how many rows; a long range comes as 5-minute or hourly buckets")
})

/** A signal's recorded values over a time range, as changes or as buckets. */
export class GetHistoryTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "get_history"
  readonly title = "A signal's history"
  readonly description = "The recorded values of a signal over a time range: every change (raw), or 5-minute or hourly buckets with min, max, average and last when the range is long. Gaps are times Nexus wasn't recording. Only signals selected for the history in the web UI have one. Times are ISO 8601 in UTC."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input

  constructor(
    private readonly inventory: Pick<InventoryService, "require">,
    private readonly history: { series(signalId: string, input: unknown): HistorySeriesDto },
    private readonly now: () => number
  ) {}

  run(input: z.infer<typeof Input>) {
    const signal = this.inventory.require(input.signal)
    const to = input.to ? Date.parse(input.to) : this.now()
    const from = input.from ? Date.parse(input.from) : to - input.hours * 3_600_000
    const series = this.history.series(signal.id, { from, to, points: input.points })
    const iso = (ms: number) => new Date(ms).toISOString()
    const number = (v: number | null) => (v === null ? undefined : series.decimals === undefined ? v : Number(v.toFixed(series.decimals)))
    const table = series.resolution === "raw"
      ? CompactTable.of(series.points, [["time", point => iso(point.ts)], ["value", point => point.text ?? number(point.v)], ["forced", point => point.forced]])
      : CompactTable.of(series.points, [
        ["from", point => iso(point.ts)], ["min", point => number(point.min)], ["max", point => number(point.max)],
        ["avg", point => number(point.avg)], ["last", point => number(point.last)], ["changes", point => point.n]
      ])
    return {
      signal: signal.topic,
      resolution: series.resolution,
      ...(series.unit ? { unit: series.unit } : {}),
      from: iso(series.from),
      to: iso(series.to),
      ...(series.before ? { before: { time: iso(series.before.ts), value: series.before.text ?? number(series.before.v) } } : {}),
      ...table,
      ...(series.resolution === "raw" && series.truncated ? { truncated: "more changes than points: ask for a shorter range" } : {}),
      ...(series.gaps.length ? { gaps: series.gaps.map(gap => `${iso(gap.from)} – ${iso(gap.to)}`) } : {})
    }
  }
}
