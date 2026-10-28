import { secret, z } from "@lox-nexus/plugin-sdk"

/** Instance config: where Home Assistant is and the token to log in with. */
export const homeAssistantConfigSchema = z.object({
  url: z.url({ protocol: /^(https?|wss?)$/ }).meta({
    title: "URL",
    description: "Address of Home Assistant, e.g. http://homeassistant.local:8123 (the WebSocket path is added)"
  }),
  token: secret(z.string().min(1)).meta({
    title: "Access token",
    description: "Long-lived access token, created in your Home Assistant profile under Security"
  })
})

export type HomeAssistantConfig = z.infer<typeof homeAssistantConfigSchema>

/** The WebSocket API address for a configured url: http(s) becomes ws(s) and /api/websocket is appended once. */
export function websocketUrl(url: string) {
  const base = url.replace(/^http/, "ws").replace(/\/+$/, "")
  return base.endsWith("/api/websocket") ? base : `${base}/api/websocket`
}
