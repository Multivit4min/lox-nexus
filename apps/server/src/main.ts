// Process entry point: builds the app and ties its lifetime to SIGINT/SIGTERM. All wiring lives in NexusApp.
import { NexusApp } from "./NexusApp.ts"

const app = new NexusApp()

const shutdown = () => {
  app.dispose().then(
    () => process.exit(0),
    (error: unknown) => {
      // no logger exists yet (M3 adds pino); this is the last chance to report a failed shutdown
      console.error("lox-nexus: shutdown failed", error)
      process.exit(1)
    }
  )
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown)

await app.start()
