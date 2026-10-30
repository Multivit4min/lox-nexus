import { secret, token, z } from "@lox-nexus/plugin-sdk"

/**
 * Instance config: the token every caller of this instance's hooks must present, or none. A
 * secret field, so a config export carries it only sealed with a passphrase; the panel still shows
 * it for copying into the caller.
 */
export const webhookConfigSchema = z.object({
  // headers carry no spaces or non-ASCII reliably, so such a token could only work in the query
  token: secret(token(z.string().min(16).max(512).regex(/^[\x21-\x7e]+$/, "visible ASCII characters without spaces").optional()))
    .meta({
      title: "Token",
      description: "Callers send it in a header, \"Authorization: Bearer <token>\" or \"X-Webhook-Token: <token>\", "
        + "or in the URL as ?token=<token>; the body is never read for it. At least 16 characters; Generate makes a random one; the panel shows it for copying. "
        + "Empty on a new instance: every call is accepted without a token, so anyone who can reach Nexus can trigger the hooks. Not safe. "
        + "Once set it can be replaced but not removed; empty keeps it."
    })
})

export type WebhookConfig = z.infer<typeof webhookConfigSchema>
