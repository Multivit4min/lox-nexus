import { FakePlug } from "./FakePlug.ts"

// npm run fake-plug [-- <port>]: a plug to try the tutorial against, until Ctrl+C
const port = Number(process.argv[2] ?? 8090)
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`"${process.argv[2]}" is not a port; start it as npm run fake-plug -- 8091`)
const plug = new FakePlug()
const url = await plug.start(port)
console.log(`Fake plug "${plug.name}" at ${url} (GET /status, POST /switch). Ctrl+C stops it.`)

// a lamp doesn't draw exactly the same all the time, and the meter keeps counting
setInterval(() => {
  plug.load = 55 + Math.round(Math.random() * 100) / 10
  if (plug.on) plug.energy += plug.load * 2 / 3_600_000
}, 2000)
