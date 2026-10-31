import { z } from "zod"
import { CredentialsSchema } from "./auth.ts"

/** GET /api/users: one account. Everyone who can log in may do everything; there are no roles. */
export interface UserDto {
  id: string
  username: string
  /** epoch ms */
  createdAt: number
  /** epoch ms of the last successful login; absent for one who never logged in */
  lastLoginAt?: number
  /** the account of the asking session */
  you: boolean
  /** how many access tokens (MCP) the account has */
  tokens: number
}

// the asking user's own password: adding or deleting accounts and setting someone's password
// ask for it again, so a browser left logged in isn't enough to take over the installation
const CurrentPassword = z.string().min(1).max(256)

/** POST /api/users */
export const CreateUserInputSchema = z.object({
  currentPassword: CurrentPassword,
  username: CredentialsSchema.shape.username,
  password: CredentialsSchema.shape.password
})
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>

/** PUT /api/users/:id/password: another user's new password; your own goes through POST /api/auth/password */
export const SetUserPasswordInputSchema = z.object({
  currentPassword: CurrentPassword,
  password: CredentialsSchema.shape.password
})
export type SetUserPasswordInput = z.infer<typeof SetUserPasswordInputSchema>

/** DELETE /api/users/:id body */
export const DeleteUserInputSchema = z.object({ currentPassword: CurrentPassword })
export type DeleteUserInput = z.infer<typeof DeleteUserInputSchema>
