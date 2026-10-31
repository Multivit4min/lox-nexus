import type { CreateUserInput, DeleteUserInput, SetUserPasswordInput, UserDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/users: the accounts; changes carry the acting user's own password */
export class UsersApi {
  constructor(private readonly http: Http) {}

  list() {
    return this.http.get<UserDto[]>("/api/users")
  }

  create(input: CreateUserInput) {
    return this.http.post<UserDto>("/api/users", input)
  }

  /** another user's password; their sessions end */
  setPassword(id: string, input: SetUserPasswordInput) {
    return this.http.put<void>(`/api/users/${encodeURIComponent(id)}/password`, input)
  }

  remove(id: string, input: DeleteUserInput) {
    return this.http.delete(`/api/users/${encodeURIComponent(id)}`, input)
  }
}
