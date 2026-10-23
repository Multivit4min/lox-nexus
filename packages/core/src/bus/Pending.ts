import type { Value } from "@lox-nexus/plugin-sdk/values"
import type { BusMessage, Cause, MessageFlags, MessageKind, MessageSource } from "./BusMessage.ts"

/** What a publisher supplies besides topic and value. */
export interface PublishOptions {
  source: MessageSource
  /** the message that triggered this one; continues its trace instead of starting a new one */
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
  /** kind-specific fields copied onto the accepted message */
  extra?: Pick<BusMessage, "force" | "outcome" | "text">
}
