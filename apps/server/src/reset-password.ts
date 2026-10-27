// Command-line entry: sets a new password for an account when it is forgotten. Uses the same
// configuration as the server (NEXUS_DATA_DIR) and may run while the server is running.
import fs from "node:fs"
import { PasswordHasher } from "./auth/PasswordHasher.ts"
import { PasswordReset } from "./auth/PasswordReset.ts"
import { PipedPassword } from "./cli/PipedPassword.ts"
import { ResetPasswordCommand } from "./cli/ResetPasswordCommand.ts"
import { TerminalPassword } from "./cli/TerminalPassword.ts"
import { Config } from "./config/Config.ts"
import { Persistence } from "./db/Persistence.ts"

const fail = (message: string): never => {
  console.error(`reset-password: ${message}`)
  process.exit(1)
}
const reason = (error: unknown) => (error instanceof Error ? error.message : String(error))

let persistence: Persistence | undefined
try {
  const config = new Config()
  // opening a missing file would create an empty database and report "no account" for the wrong directory
  if (!fs.existsSync(config.databaseFile)) fail(`no database at ${config.databaseFile}; set NEXUS_DATA_DIR to the server's data directory`)
  console.error(`Database: ${config.databaseFile}`)
  // never migrate: a running server of another version would then work on a schema it doesn't know
  persistence = new Persistence(config.databaseFile, message => console.error(message), { migrate: false })
} catch (error) {
  fail(`can't open the database: ${reason(error)}`)
}
const db = persistence!
if (db.pending.length > 0) {
  fail(`the database's schema is older than this version of Nexus (missing ${db.pending.join(", ")}). Start the server of this version once, then retry.`)
}
const source = process.stdin.isTTY ? new TerminalPassword(process.stdin, process.stderr, process) : new PipedPassword(process.stdin, process.stderr)
const reset = new PasswordReset(db.db, db.users, db.sessions, new PasswordHasher())
const code = await new ResetPasswordCommand(reset, source, { info: console.log, error: message => console.error(`reset-password: ${message}`) })
  .run(process.argv.slice(2))
db.close()
process.exit(code)
