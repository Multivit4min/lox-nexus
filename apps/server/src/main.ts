// Process entry point: builds the app and ties its lifetime to SIGINT/SIGTERM. All wiring lives in NexusApp.
import { Config } from "./config/Config.ts"
import { LoggerFactory } from "./logging/LoggerFactory.ts"
import { NexusApp } from "./NexusApp.ts"

let config: Config
try {
  config = new Config()
} catch (error) {
  console.error("lox-nexus: invalid configuration\n", error)
  process.exit(1)
}
const log = LoggerFactory.create(config)

let app: NexusApp
try {
  app = new NexusApp(config, log)
} catch (error) {
  log.fatal({ err: error, dataDir: config.dataDir }, "cannot open the database")
  process.exit(1)
}

let exiting = false
const exit = (code: number) => {
  if (exiting) return
  exiting = true
  process.exit(code)
}

const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down")
  app.dispose().then(() => exit(0), (error: unknown) => {
    log.error({ err: error }, "shutdown failed")
    exit(1)
  })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown(signal))

try {
  const address = await app.start()
  if (address) log.info({ address, dataDir: config.dataDir }, "lox nexus is running")
} catch (error) {
  log.fatal({ err: error }, "startup failed")
  await app.dispose().catch(() => undefined)
  exit(1)
}
