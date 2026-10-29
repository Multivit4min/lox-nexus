import { token, z } from "@lox-nexus/plugin-sdk"

/**
 * Instance config: the token every caller of this instance's hooks must present, or none. Not a
 * secret field, so the form shows it for copying into the caller; it is no harder to read than
 * the caller's own config, where it has to be in plain text anyway.
 */
export const webhookConfigSchema = z.object({
  // headers carry no spaces or non-ASCII reliably, so such a token could only work in the query
  token: token(z.string().min(16).max(512).regex(/^[\x21-\x7e]+$/, "visible ASCII characters without spaces").optional())
    .meta({
      title: "Token",
      description: "Callers send it in a header, \"Authorization: Bearer <token>\" or \"X-Webhook-Token: <token>\", "
        + "or in the URL as ?token=<token>; the body is never read for it. At least 16 characters; Generate makes a random one. "
        + "Empty: every call is accepted without a token, so anyone who can reach Nexus can trigger the hooks. Not safe."
    })
})

export type WebhookConfig = z.infer<typeof webhookConfigSchema>
