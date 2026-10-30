import { Action } from "@lox-nexus/plugin-sdk"
import type { InfluxPlugin } from "./InfluxPlugin.ts"

/** Sends the batch waiting for a retry at once, instead of after the retry delay (up to 10 minutes). */
export class RetryNowAction extends Action<InfluxPlugin, object> {
  static readonly id = "retry-now"
  static readonly label = "Retry now"
  static readonly description = "Writes the points waiting for a retry now, e.g. after fixing the token, bucket or database"
  /** its button is in the Export section */
  static readonly placement = "panel"

  run() {
    return this.plugin.writer.retryNow() ? "Writing the waiting points now; the Export section shows how it went" : "No write is waiting for a retry"
  }
}
