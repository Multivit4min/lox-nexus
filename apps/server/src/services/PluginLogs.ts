import type { PluginLogSink } from "@lox-nexus/core"
import type { LogLevel } from "@lox-nexus/plugin-sdk/wire"
import type { Logger } from "pino"

/** Plugin log lines into the server log, tagged with the instance's slug. */
export class PluginLogs implements PluginLogSink {
  constructor(private readonly logger: Logger) {}

  /** `level` maps straight onto the pino level of the same name */
  log(instance: { id: string; slug: string }, level: LogLevel, message: string, data?: unknown) {
    this.logger[level]({ plugin: instance.slug, ...(data === undefined ? {} : { data }) }, message)
  }
}
