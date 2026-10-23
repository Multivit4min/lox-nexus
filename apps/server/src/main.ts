// Process entry point: builds the app and ties its lifetime to SIGINT/SIGTERM. All wiring lives in NexusApp.
import { Config } from "./config/Config.ts"
import { LoggerFactory } from "./logging/LoggerFactory.ts"
import { NexusApp } from "./NexusApp.ts"

const config = new Config()
const log = LoggerFactory.create(config)
const app = new NexusApp(config, log)

const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down")
  app.dispose().then(
    () => process.exit(0),
    (error: unknown) => {
      log.error({ err: error }, "shutdown failed")
      process.exit(1)
    }
  )
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown(signal))

try {
  const address = await app.start()
  log.info({ address, dataDir: config.dataDir }, "lox nexus is running")
} catch (error) {
  log.fatal({ err: error }, "startup failed")
  await app.dispose().catch(() => undefined)
  process.exit(1)
}
