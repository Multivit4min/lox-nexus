import { secret, z } from "@lox-nexus/plugin-sdk"
import { FeedClient } from "./feed/FeedClient.ts"
import { Zone } from "./time/Zone.ts"

/**
 * Instance config. The URL is secret: private iCal links (Google, Nextcloud, Outlook) carry
 * their access token in the URL.
 */
export const calendarConfigSchema = z.object({
  url: secret(z.url({ protocol: /^(https?|webcals?)$/i }))
    .describe("Link to the iCal feed (http, https or webcal), e.g. Google's \"secret address in iCal format\""),
  username: z.string().min(1).optional().describe("For feeds behind HTTP basic auth (e.g. Nextcloud without a share link)"),
  password: secret(z.string()).optional().describe("Password or app password for basic auth"),
  refreshMinutes: z.int().min(1).max(10_080).default(15).describe("Minutes between two reads of the feed"),
  timeout: z.number().min(1).max(120).default(30).describe("Seconds one read of the feed may take"),
  timeZone: z.string().refine(Zone.isValid, "unknown time zone").optional()
    .describe("IANA time zone (e.g. Europe/Vienna) for all-day events, times without a zone and the Loxone time format; default: the server's")
})
  .refine(config => config.password === undefined || config.username !== undefined, {
    message: "a password needs a username", path: ["username"]
  })
  .refine(config => FeedClient.credentialsReadable(config.url), {
    message: "the user name or password in the link isn't valid URL encoding (write % as %25)", path: ["url"]
  })

export type CalendarConfig = z.infer<typeof calendarConfigSchema>
