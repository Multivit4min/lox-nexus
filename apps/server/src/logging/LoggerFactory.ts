import pino, { type Logger } from "pino"
import type { Config } from "../config/Config.ts"

/** Creates the process logger: JSON lines, or readable output when attached to a terminal. */
export class LoggerFactory {
  static create(config: Pick<Config, "logLevel">): Logger {
    const pretty = process.stdout.isTTY
    return pino({
      level: config.logLevel,
      ...(pretty ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" } } } : {})
    })
  }

  /** for tests */
  static silent(): Logger {
    return pino({ level: "silent" })
  }
}
