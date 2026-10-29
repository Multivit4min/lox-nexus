import { secret, z } from "@lox-nexus/plugin-sdk"
import { FeedClient } from "./feed/FeedClient.ts"
import { Zone } from "./time/Zone.ts"

/**
 * Instance config. The URL is secret: private iCal links (Google, Nextcloud, Outlook) carry
 * their access token in the URL.
 */
export const calendarConfigSchema = z.object({
  url: secret(z.url({ protocol: /^(https?|webcals?)$/i })).meta({
    title: "Calendar link (iCal)",
    description: "Link to the iCal feed (http, https or webcal), e.g. Google's \"secret address in iCal format\""
  }),
  username: z.string().min(1).optional().meta({
    title: "User name", description: "Only for feeds behind HTTP basic auth (e.g. Nextcloud without a share link)"
  }),
  password: secret(z.string()).optional().meta({ title: "Password", description: "Password or app password for the user name" }),
  refreshMinutes: z.int().min(1).max(10_080).default(15).meta({
    title: "Read every (minutes)", description: "Minutes between two reads of the feed"
  }),
  timeout: z.number().min(1).max(120).default(30).meta({
    title: "Timeout (seconds)", description: "Seconds one read of the feed may take before it counts as failed"
  }),
  timeZone: z.string().refine(Zone.isValid, "unknown time zone").optional().meta({
    title: "Time zone",
    description: "IANA zone such as Europe/Vienna, for all-day events, times without a zone and Loxone date and time. "
      + "Empty: the zone of the Loxone project Nexus read last, otherwise the server's (in a container usually UTC)"
  })
})
  .refine(config => config.password === undefined || config.username !== undefined, {
    message: "a password needs a username", path: ["username"]
  })
  .refine(config => FeedClient.credentialsReadable(config.url), {
    message: "the user name or password in the link isn't valid URL encoding (write % as %25)", path: ["url"]
  })

export type CalendarConfig = z.infer<typeof calendarConfigSchema>
