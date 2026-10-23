import { NexusApp } from "./NexusApp.ts"

const app = new NexusApp()

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.dispose())
}

await app.start()
