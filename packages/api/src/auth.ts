import { z } from "zod"

/** Login and first-run setup. Length limits keep scrypt inputs bounded. */
export const CredentialsSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(256)
})
export type Credentials = z.infer<typeof CredentialsSchema>

export const ChangePasswordSchema = z.object({
  current: z.string().min(1).max(256),
  next: z.string().min(8).max(256)
})
export type ChangePassword = z.infer<typeof ChangePasswordSchema>

/** GET /api/auth: what the UI should show before anything else */
export interface AuthStateDto {
  /** no account exists yet: show the setup screen */
  setupRequired: boolean
  user?: { id: string; username: string }
}
