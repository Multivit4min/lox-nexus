import path from "node:path"
import { z } from "zod"

/** accepts true/false/1/0 only; anything else is a configuration error rather than silently false */
const flag = z.enum(["true", "false", "1", "0"]).transform(text => text === "true" || text === "1")
/** comma-separated list; blanks are ignored */
const list = z.string().transform(text => text.split(",").map(item => item.trim()).filter(Boolean))

/** every environment variable the server reads, with defaults */
const EnvSchema = z.object({
  NEXUS_DATA_DIR: z.string().min(1).default("./data"),
  NEXUS_HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  NEXUS_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  NEXUS_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** set when served over https (directly or behind a proxy), so the browser only sends the cookie encrypted */
  NEXUS_SECURE_COOKIES: flag.default(false),
  /** directory with the built web UI; served when it exists */
  NEXUS_WEB_DIR: z.string().min(1).optional(),
  /** comma-separated proxy addresses/CIDRs whose X-Forwarded-For is believed (login throttling is per client address) */
  NEXUS_TRUST_PROXY: list.default([]),
  /** comma-separated origins the UI is reached at through a proxy that rewrites Host, e.g. https://nexus.example */
  NEXUS_PUBLIC_ORIGINS: list.pipe(z.array(z.url())).default([]),
  /** development: run every plugin in this directory from source (`npm run dev` sets the workspace's plugins/) */
  NEXUS_DEV_PLUGINS_DIR: z.string().min(1).optional()
})

/** Process configuration from environment variables. Everything persistent lives under `dataDir`. */
export class Config {
  /** absolute path */
  readonly dataDir: string
  readonly httpHost: string
  /** 0 picks a free port (tests) */
  readonly httpPort: number
  readonly logLevel: z.infer<typeof EnvSchema>["NEXUS_LOG_LEVEL"]
  readonly secureCookies: boolean
  /** absolute path, if configured */
  readonly webDir: string | undefined
  readonly trustProxy: string[]
  readonly publicOrigins: string[]
  /** absolute path, if configured */
  readonly devPluginsDir: string | undefined

  /** @throws ZodError naming every invalid variable */
  constructor(env: Record<string, string | undefined> = process.env) {
    const parsed = EnvSchema.parse(Config.withoutEmpty(env))
    this.dataDir = path.resolve(parsed.NEXUS_DATA_DIR)
    this.httpHost = parsed.NEXUS_HTTP_HOST
    this.httpPort = parsed.NEXUS_HTTP_PORT
    this.logLevel = parsed.NEXUS_LOG_LEVEL
    this.secureCookies = parsed.NEXUS_SECURE_COOKIES
    this.webDir = parsed.NEXUS_WEB_DIR && path.resolve(parsed.NEXUS_WEB_DIR)
    this.trustProxy = parsed.NEXUS_TRUST_PROXY
    this.publicOrigins = parsed.NEXUS_PUBLIC_ORIGINS
    this.devPluginsDir = parsed.NEXUS_DEV_PLUGINS_DIR && path.resolve(parsed.NEXUS_DEV_PLUGINS_DIR)
  }

  /** the SQLite file */
  get databaseFile() {
    return path.join(this.dataDir, "nexus.db")
  }

  // compose files often set `NEXUS_HTTP_PORT=` meaning "unset"; coerced, "" would become port 0
  private static withoutEmpty(env: Record<string, string | undefined>) {
    return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value.trim() !== ""))
  }
}
