import type { AppUpdateDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/system/update: whether a newer Nexus is out, and the daily check's switch */
export class SystemUpdateApi {
  constructor(private readonly http: Http) {}

  get() {
    return this.http.get<AppUpdateDto>("/api/system/update")
  }

  /** asks GitHub now; answers when it has */
  check() {
    return this.http.post<AppUpdateDto>("/api/system/update/check")
  }

  setEnabled(enabled: boolean) {
    return this.http.put<AppUpdateDto>("/api/system/update/settings", { enabled })
  }
}
