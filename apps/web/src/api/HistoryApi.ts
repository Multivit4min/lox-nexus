import type { HistorySeriesDto, HistorySettings, HistorySettingsInput, HistoryStatsDto, SelectionDto, SelectionModeDto, SelectionRulesUpdate } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/history and the history's selection (/api/selections/history) */
export class HistoryApi {
  constructor(private readonly http: Http) {}

  /** the server picks the resolution: every change, or 5-minute or 1-hour buckets */
  series(signalId: string, from: number, to: number, points = 800) {
    return this.http.get<HistorySeriesDto>(`/api/history/signals/${encodeURIComponent(signalId)}?${new URLSearchParams({ from: String(from), to: String(to), points: String(points) })}`)
  }

  purge(signalId: string) {
    return this.http.delete(`/api/history/signals/${encodeURIComponent(signalId)}`)
  }

  /** ids of the signals recorded right now */
  recorded() {
    return this.http.get<string[]>("/api/history/recorded")
  }

  stats() {
    return this.http.get<HistoryStatsDto>("/api/history/stats")
  }

  settings() {
    return this.http.get<HistorySettings>("/api/history/settings")
  }

  /** fields left out keep their value */
  updateSettings(input: Partial<HistorySettingsInput>) {
    return this.http.put<HistorySettings>("/api/history/settings", input)
  }

  selection() {
    return this.http.get<SelectionDto>("/api/selections/history")
  }

  setMode(mode: SelectionModeDto) {
    return this.http.put<SelectionDto>("/api/selections/history/mode", { mode })
  }

  /** all or none; `include: null` removes a rule */
  setRules(rules: SelectionRulesUpdate) {
    return this.http.put<SelectionDto>("/api/selections/history/rules", rules)
  }
}
