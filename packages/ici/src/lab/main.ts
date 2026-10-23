import { LabCli } from "./LabCli.ts"

const cli = new LabCli()
const argv = process.argv.slice(2)
const controller = new AbortController()

// interruptible commands stop gracefully on the first Ctrl+C; everything else (and a second Ctrl+C) exits
process.on("SIGINT", () => {
  if (controller.signal.aborted || !cli.isInterruptible(argv[0])) process.exit(130)
  controller.abort()
})

process.exitCode = await cli.run(argv, { out: process.stdout, err: process.stderr, signal: controller.signal })
