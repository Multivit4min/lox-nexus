import { LabCli } from "./LabCli.ts"

const controller = new AbortController()
process.once("SIGINT", () => controller.abort())

process.exitCode = await new LabCli().run(process.argv.slice(2), { out: process.stdout, signal: controller.signal })
