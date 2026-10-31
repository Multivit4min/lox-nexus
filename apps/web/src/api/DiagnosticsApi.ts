import type { DiagnosticsDto, ServerClockDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/diagnostics: the samples of the System page, and the server's clock */
export class DiagnosticsApi {
  /** a plain link, so the browser saves the file as it arrives */
  static readonly CSV_URL = "/api/diagnostics/samples.csv"

  constructor(private readonly http: Http) {}

  /** @param since only samples after this time */
  get(since?: number) {
    return this.http.get<DiagnosticsDto>(since === undefined ? "/api/diagnostics" : `/api/diagnostics?since=${since}`)
  }

  /** the server's time now (epoch ms) */
  async serverNow() {
    return (await this.http.get<ServerClockDto>("/api/diagnostics/clock")).now
  }
}
