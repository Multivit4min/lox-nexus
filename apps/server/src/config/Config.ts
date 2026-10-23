import path from "node:path"
import { z } from "zod"

const flag = z.enum(["true", "false", "1", "0"]).transform(text => text === "true" || text === "1")

const EnvSchema = z.object({
  NEXUS_DATA_DIR: z.string().min(1).default("./data"),
  NEXUS_HTTP_HOST: z.string().min(1).default("0.0.0.0"),
  NEXUS_HTTP_PORT: z.coerce.number().int().min(0).max(65535).default(8080),
  NEXUS_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** set when served over https (directly or behind a proxy), so the browser only sends the cookie encrypted */
  NEXUS_SECURE_COOKIES: flag.default(false),
  /** directory with the built web UI; served when it exists */
  NEXUS_WEB_DIR: z.string().min(1).optional()
})

/** Process configuration from environment variables. Everything persistent lives under `dataDir`. */
export class Config {
  readonly dataDir: string
  readonly httpHost: string
  readonly httpPort: number
  readonly logLevel: z.infer<typeof EnvSchema>["NEXUS_LOG_LEVEL"]
  readonly secureCookies: boolean
  readonly webDir: string | undefined

  /** @throws ZodError naming every invalid variable */
  constructor(env: Record<string, string | undefined> = process.env) {
    const parsed = EnvSchema.parse(env)
    this.dataDir = path.resolve(parsed.NEXUS_DATA_DIR)
    this.httpHost = parsed.NEXUS_HTTP_HOST
    this.httpPort = parsed.NEXUS_HTTP_PORT
    this.logLevel = parsed.NEXUS_LOG_LEVEL
    this.secureCookies = parsed.NEXUS_SECURE_COOKIES
    this.webDir = parsed.NEXUS_WEB_DIR && path.resolve(parsed.NEXUS_WEB_DIR)
  }

  /** the SQLite file */
  get databaseFile() {
    return path.join(this.dataDir, "nexus.db")
  }
}
