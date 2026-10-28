/**
 * A rule of the configuration was violated: a duplicate id, a taken slug, topic or port, an
 * unknown or wrong signal for a wire. The message is for people; `code` is for programs (the API
 * answers it with 409 and the code), so clients needn't parse messages that contain ids.
 */
export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode, message: string) {
    super(message)
    this.name = "DomainError"
  }
}

export type DomainErrorCode =
  | "signal-exists" | "unknown-signal" | "topic-taken" | "packet-id-taken" | "unknown-capability"
  | "wire-exists" | "not-a-source" | "not-a-target" | "target-fed"
  | "miniserver-exists" | "unknown-miniserver" | "port-taken"
  | "instance-exists" | "unknown-instance" | "slug-taken"
