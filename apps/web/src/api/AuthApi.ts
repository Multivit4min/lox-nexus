import type { AuthStateDto, ChangePassword, Credentials } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/auth */
export class AuthApi {
  constructor(private readonly http: Http) {}

  state() {
    return this.http.get<AuthStateDto>("/api/auth")
  }

  setup(credentials: Credentials) {
    return this.http.post<AuthStateDto>("/api/auth/setup", credentials)
  }

  login(credentials: Credentials) {
    return this.http.post<AuthStateDto>("/api/auth/login", credentials)
  }

  logout() {
    return this.http.post<void>("/api/auth/logout")
  }

  changePassword(change: ChangePassword) {
    return this.http.post<void>("/api/auth/password", change)
  }
}
