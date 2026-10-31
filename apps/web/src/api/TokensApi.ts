import type { AccessTokenDto, CreateAccessTokenInput, CreatedAccessTokenDto, McpActivityDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/tokens: your own access tokens for MCP */
export class TokensApi {
  constructor(private readonly http: Http) {}

  list() {
    return this.http.get<AccessTokenDto[]>("/api/tokens")
  }

  /** answers the token itself, which is never shown again */
  create(input: CreateAccessTokenInput) {
    return this.http.post<CreatedAccessTokenDto>("/api/tokens", input)
  }

  /** what your agents changed or did, newest first */
  activity(limit = 50) {
    return this.http.get<McpActivityDto[]>(`/api/tokens/activity?limit=${limit}`)
  }

  revoke(id: string) {
    return this.http.delete(`/api/tokens/${encodeURIComponent(id)}`)
  }
}
