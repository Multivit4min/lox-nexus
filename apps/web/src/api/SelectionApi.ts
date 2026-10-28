import type { SelectionDto, SelectionModeDto, SelectionRulesUpdate } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/selections/:consumer: which signals the history, or a plugin instance that watches signals, takes */
export class SelectionApi {
  constructor(private readonly http: Http) {}

  get(consumer: string) {
    return this.http.get<SelectionDto>(this.url(consumer))
  }

  setMode(consumer: string, mode: SelectionModeDto) {
    return this.http.put<SelectionDto>(`${this.url(consumer)}/mode`, { mode })
  }

  /** all or none; `include: null` removes a rule */
  setRules(consumer: string, rules: SelectionRulesUpdate) {
    return this.http.put<SelectionDto>(`${this.url(consumer)}/rules`, rules)
  }

  private url(consumer: string) {
    return `/api/selections/${encodeURIComponent(consumer)}`
  }
}
