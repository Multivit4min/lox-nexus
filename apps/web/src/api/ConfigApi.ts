import type { ConfigExport, ConfigImportResultDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/config: the whole configuration as one JSON document */
export class ConfigApi {
  constructor(private readonly http: Http) {}

  /** the server also sends it as a download; here it is read as data so the browser can save it itself */
  export() {
    return this.http.get<ConfigExport>("/api/config/export")
  }

  /** replaces the current configuration; the server restores it if a step fails */
  import(doc: unknown) {
    return this.http.post<ConfigImportResultDto>("/api/config/import", doc)
  }
}
