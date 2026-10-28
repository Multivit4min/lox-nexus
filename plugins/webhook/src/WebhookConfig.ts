import { secret, z } from "@lox-nexus/plugin-sdk"

/** Instance config: the one shared token every caller of this instance's hooks must present. */
export const webhookConfigSchema = z.object({
  // headers carry no spaces or non-ASCII reliably, so such a token could only work in the query
  token: secret(z.string().min(16).max(512).regex(/^[\x21-\x7e]+$/, "visible ASCII characters without spaces"))
    .meta({
      title: "Secret token",
      description: "Every call must carry this token; use at least 16 characters, e.g. from `openssl rand -hex 24`"
    })
})

export type WebhookConfig = z.infer<typeof webhookConfigSchema>
