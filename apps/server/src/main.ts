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
let restarting: Promise<void> | undefined
// NexusApp swaps a restored backup in under its database lock; a restart builds a new one for that
const build = () => {
  app = new NexusApp(config, log, { restart: () => void (restarting ??= restart().finally(() => (restarting = undefined))) })
}
try {
  build()
} catch (error) {
  log.fatal({ err: error, dataDir: config.dataDir }, "cannot open the data directory (or apply a restored backup)")
  process.exit(1)
}

let exiting = false
const exit = (code: number) => {
  if (exiting) return
  exiting = true
  process.exit(code)
}

// a restart in progress finishes first, so the app it built is the one disposed
const shutdown = (signal: string) => {
  log.info({ signal }, "shutting down")
  ;(restarting ?? Promise.resolve()).then(() => app.dispose()).then(() => exit(0), (error: unknown) => {
    log.error({ err: error }, "shutdown failed")
    exit(1)
  })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => shutdown(signal))

async function start() {
  try {
    const address = await app.start()
    if (address) log.info({ address, dataDir: config.dataDir }, "lox nexus is running")
  } catch (error) {
    log.fatal({ err: error }, "startup failed")
    await app.dispose().catch(() => undefined)
    exit(1)
  }
}

// a fresh app on the same process: the old one releases the port, the database lock and its workers first
async function restart() {
  log.info("restarting")
  try {
    await app.dispose()
    build()
  } catch (error) {
    log.fatal({ err: error }, "restarting failed; a restored backup's previous files are in a before-restore folder of the data directory")
    return exit(1)
  }
  await start()
}

await start()
