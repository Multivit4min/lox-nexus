import type { ConfigExport, ConfigImportResultDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/config: the whole configuration as one JSON document */
export class ConfigApi {
  constructor(private readonly http: Http) {}

  /** the server also sends it as a download; here it is read as data so the browser can save it itself */
  export() {
    return this.http.get<ConfigExport>("/api/config/export")
  }

  /** the same with the plugins' secret settings, sealed with the passphrase (12 characters at least) */
  exportSealed(passphrase: string) {
    return this.http.post<ConfigExport>("/api/config/export", { passphrase })
  }

  /** replaces the current configuration; the server restores it if a step fails. A file with sealed secrets needs its passphrase */
  import(doc: unknown, passphrase?: string) {
    return this.http.post<ConfigImportResultDto>("/api/config/import", passphrase === undefined ? doc : { file: doc, passphrase })
  }
}
