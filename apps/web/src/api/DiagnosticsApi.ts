import type { DiagnosticsDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/diagnostics: the samples of the System page */
export class DiagnosticsApi {
  /** a plain link, so the browser saves the file as it arrives */
  static readonly CSV_URL = "/api/diagnostics/samples.csv"

  constructor(private readonly http: Http) {}

  /** @param since only samples after this time */
  get(since?: number) {
    return this.http.get<DiagnosticsDto>(since === undefined ? "/api/diagnostics" : `/api/diagnostics?since=${since}`)
  }
}
