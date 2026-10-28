import type { WebhookCall } from "../call/WebhookCall.ts"
import type { HookMethod } from "./HookMethod.ts"

/** A signal that reacts to calls of one hook; the webhook sensors implement it. */
export interface HookHandler {
  readonly hook: string
  readonly method: HookMethod
  /** a short description for the panel, e.g. "trigger, 1000 ms pulse" */
  readonly summary: string
  /** handles a call whose method it accepts; returns a short reason when the call is unusable for it */
  handle(call: WebhookCall): string | undefined
}
