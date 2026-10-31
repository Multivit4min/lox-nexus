import type { JsonSchema } from "@lox-nexus/plugin-sdk/wire"
import { HttpError } from "../http/HttpError.ts"
import { SecretFields } from "../plugins/SecretFields.ts"

/** Agents never type secrets in (ADR 0020): inputs that carry one are refused, so the audit log never holds one. */
export class SecretInputs {
  /** @throws HttpError 400 naming the secret fields `value` sets */
  static refuse(schema: JsonSchema, value: unknown, what: string) {
    const secret = new SecretFields(schema).present(value)
    if (secret.length > 0) throw HttpError.badRequest(`${what} (${secret.join(", ")}) are entered by a person in the web UI: leave them out, and tell the user where to enter them`)
  }

  /** the secret fields the schema requires: what an instance created without them still needs */
  static required(schema: JsonSchema) {
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter(name => typeof name === "string") : [])
    return new SecretFields(schema).secretNames.filter(name => required.has(name))
  }
}
