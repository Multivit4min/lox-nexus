import { secret, z } from "@lox-nexus/plugin-sdk"

/** the fields each api needs, with their form titles for the error message */
const REQUIRED = {
  v2: { org: "Organization", bucket: "Bucket", token: "API token" },
  v1: { database: "Database" }
} as const

const API_LABELS = { v2: "InfluxDB 2 or 3 (token)", v1: "InfluxDB 1 (user and password)" } as const

/** fetch refuses URLs with credentials, and they would show wherever the URL does */
function withoutCredentials(url: string) {
  const parsed = URL.parse(url)
  return parsed !== null && parsed.username === "" && parsed.password === ""
}

const optionalText = (title: string, description: string) => z.string().trim().max(200).optional().meta({ title, description })

/**
 * Goes into a header: a line break or NUL would make fetch fail with a message holding the whole
 * header, the token included. Empty passes here; the api check below says when it is required.
 */
const headerSafe = (max: number) => z.string().trim().max(max).regex(/^[\x21-\x7e]*$/, "only visible ASCII characters, no spaces")

/** Instance config: where and how to write. Which signals are written is chosen on the instance page. */
export const influxConfigSchema = z.object({
  url: z.url({ protocol: /^https?$/ })
    .refine(withoutCredentials, "put the user and password into their own fields, not into the URL")
    .meta({ title: "URL", description: "Address of the InfluxDB server, e.g. http://influx.local:8086" }),
  api: z.enum(["v2", "v1"]).default("v2").meta({
    title: "API",
    description: "InfluxDB 3 takes the version 2 write API with the database as bucket",
    enumLabels: API_LABELS
  }),
  org: optionalText("Organization", "InfluxDB 2: the organization's name or ID (InfluxDB 3 ignores it; enter any name)"),
  bucket: optionalText("Bucket", "InfluxDB 2: the bucket; InfluxDB 3: the database"),
  token: secret(headerSafe(1000)).optional().meta({ title: "API token", description: "InfluxDB 2 or 3: a token allowed to write to the bucket" }),
  database: optionalText("Database", "InfluxDB 1: the database"),
  retentionPolicy: optionalText("Retention policy", "InfluxDB 1: leave empty for the database's default"),
  // basic auth splits user and password at the first colon
  username: headerSafe(200).refine(name => !name.includes(":"), "must not contain a colon").optional().meta({ title: "User", description: "InfluxDB 1: leave empty when authentication is off" }),
  password: secret(z.string().max(1000)).optional().meta({ title: "Password", description: "InfluxDB 1: the user's password" }),
  // a line starting with # is a comment in line protocol
  measurement: z.string().min(1).max(200).refine(name => !name.startsWith("#"), "must not start with #").default("lox_nexus")
    .meta({ title: "Measurement", description: "All points go to this measurement; signals are told apart by tags" }),
  tagTopic: z.boolean().default(true).meta({ title: "Tag: topic", description: "Add the signal's bus topic as tag `topic`" }),
  tagLabel: z.boolean().default(true).meta({ title: "Tag: name", description: "Add the signal's name as tag `label`" }),
  tagOwner: z.boolean().default(true)
    .meta({ title: "Tag: owner", description: "Add the Miniserver or plugin instance as tag `owner` (miniserver:<id> or plugin:<id>)" }),
  flushSeconds: z.number().int().min(1).max(3600).default(5)
    .meta({ title: "Write interval (s)", description: "Values are collected and written at least this often" }),
  batchSize: z.number().int().min(1).max(10_000).default(5000)
    .meta({ title: "Batch size", description: "Points per request; a full batch is written right away" }),
  maxBufferedPoints: z.number().int().min(100).max(50_000).default(25_000)
    .meta({ title: "Buffer (points)", description: "Points kept while InfluxDB is unreachable; beyond that the oldest are dropped" }),
  writeInitial: z.boolean().default(true)
    .meta({ title: "Write initial values", description: "Also write the current values sent when watching starts, not only changes" }),
  gzip: z.boolean().default(true).meta({ title: "Compress (gzip)", description: "Send requests gzip-compressed" })
}).superRefine((config, context) => {
  for (const [key, title] of Object.entries(REQUIRED[config.api])) {
    if (!config[key as keyof typeof config]) {
      context.addIssue({ code: "custom", path: [key], message: `${title} is required for ${API_LABELS[config.api]}` })
    }
  }
  if (config.batchSize > config.maxBufferedPoints) {
    context.addIssue({ code: "custom", path: ["batchSize"], message: "Batch size must not exceed the buffer" })
  }
})

export type InfluxConfig = z.infer<typeof influxConfigSchema>
