import { discoverable, secret, z } from "@lox-nexus/plugin-sdk"
import { Topic } from "./topics/Topic.ts"

/** credentials in the URL would show wherever the URL does (the panel, logs) */
function withoutCredentials(url: string) {
  const parsed = URL.parse(url)
  return parsed !== null && parsed.username === "" && parsed.password === ""
}

/** a topic prefix the plugin publishes below: exact, without a leading or trailing slash */
const prefix = (fallback: string, title: string, description: string) => Topic.nameSchema
  .refine(topic => !topic.startsWith("/") && !topic.endsWith("/"), "no leading or trailing /")
  .refine(topic => !topic.startsWith("$"), "topics starting with $ belong to the broker")
  .default(fallback)
  .meta({ title, description })

/** Instance config: one broker, how to log in, and how the export publishes. */
export const mqttConfigSchema = z.object({
  url: discoverable(z.url({ protocol: /^(mqtts?|wss?)$/, error: "an mqtt://, mqtts://, ws:// or wss:// URL" })
    .refine(withoutCredentials, "put the user and password into their own fields, not into the URL")
    .meta({
      title: "Broker URL",
      description: "mqtt://host:1883, mqtts://host:8883 (TLS), ws://host:9001/mqtt or wss://… (WebSocket; include the path the broker serves). Find looks for brokers that announce themselves on the network"
    })),
  username: z.string().max(200).optional().meta({ title: "User", description: "Leave empty when the broker allows anonymous clients" }),
  password: secret(z.string().max(1000)).optional().meta({ title: "Password", description: "The user's password" }),
  clientId: z.string().max(128).regex(/^[\x21-\x7e]+$/, "visible ASCII characters without spaces").optional().meta({
    title: "Client ID",
    description: "Empty: lox-nexus-<instance>-<random>, kept across restarts. Two clients with the same ID throw each other off the broker, so never reuse one"
  }),
  rejectUnauthorized: z.boolean().default(true).meta({
    title: "Check TLS certificate",
    description: "mqtts and wss: refuse a broker whose certificate isn't valid for its name. Turn off only for a broker with a self-signed certificate on your own network"
  }),
  baseTopic: prefix("lox-nexus", "Export base topic",
    "Exported signals are published to <base topic>/<signal topic>, and the online status to <base topic>/status. Give each Nexus or instance on one broker its own"),
  onlineStatus: z.boolean().default(true).meta({
    title: "Online status",
    description: "Publish online or offline (retained) to <base topic>/status; the broker sends offline by itself when Nexus goes away"
  }),
  discovery: z.boolean().default(false).meta({
    title: "Home Assistant discovery",
    description: "Announce the exported signals to Home Assistant as read-only sensors and binary sensors"
  }),
  discoveryPrefix: prefix("homeassistant", "Discovery prefix", "Home Assistant's MQTT discovery prefix (its default is homeassistant)"),
  browseFilter: Topic.filterSchema.default("#").meta({
    title: "Browse topics",
    description: "What the catalog shows, as an MQTT filter: # for everything, or e.g. zigbee2mqtt/#. Subscribed only while you browse"
  }),
  browseLimit: z.number().int().min(100).max(5000).default(1000).meta({
    title: "Browse limit (topics)",
    description: "At most this many topics are kept while browsing; the ones heard of longest ago are dropped first"
  })
})

export type MqttConfig = z.infer<typeof mqttConfigSchema>
