import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage, Cause, MessageFlags, MessageKind, MessageSource } from "./BusMessage.ts"

export interface PublishOptions {
  source: MessageSource
  cause?: Cause
  flags?: MessageFlags
  /** deliver even if the value equals the current one */
  force?: boolean
}

/** A message waiting in the bus queue; it gets its id only once it is accepted. */
export interface Pending {
  kind: MessageKind
  topic: string
  value?: Value
  options: PublishOptions
  extra?: Pick<BusMessage, "force" | "outcome" | "text">
}
