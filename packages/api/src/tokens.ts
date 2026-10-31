import { z } from "zod"

/**
 * What an access token lets an agent do over MCP: `read` (always), `configure` (signals, wires,
 * plugin instances) and `operate` (acting on devices: forces, plugin actions).
 */
export const AccessScopeSchema = z.enum(["read", "configure", "operate"])
export type AccessScope = z.infer<typeof AccessScopeSchema>

/** GET /api/tokens: one of your access tokens; the token itself is shown once, at creation */
export interface AccessTokenDto {
  id: string
  name: string
  scopes: AccessScope[]
  /** epoch ms */
  createdAt: number
  /** epoch ms of its last use, to the minute; absent while unused */
  lastUsedAt?: number
}

/** POST /api/tokens; asks for your own password again, like the users page */
export const CreateAccessTokenInputSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(64),
  // read is always granted; listing it is allowed
  scopes: z.array(AccessScopeSchema).max(3)
})
export type CreateAccessTokenInput = z.infer<typeof CreateAccessTokenInputSchema>

/** the answer to POST /api/tokens: the token, which is never shown again, and its row */
export interface CreatedAccessTokenDto {
  token: string
  accessToken: AccessTokenDto
}
