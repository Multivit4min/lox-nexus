import type { DataType } from "../DataType.ts"

/**
 * Converts between the payload bytes of one data type and its JavaScript value.
 *
 * Codecs are stateless and shared through PayloadCodecs. Decoding is lenient about length (longer
 * payloads are accepted and extra bytes ignored, since Loxone may add fields); encoding is strict
 * and refuses values it cannot represent instead of clamping them.
 */
export abstract class PayloadCodec<T> {
  abstract readonly dataType: DataType
  /** short lower-camel name used in error messages and by the lab CLI */
  abstract readonly name: string
  /** fixed payload size in bytes, undefined for variable length payloads */
  abstract readonly size: number | undefined

  /** throws RangeError if the payload is too short */
  abstract decode(payload: Buffer): T

  /** throws RangeError or TypeError if the value can't be represented */
  abstract encode(value: T): Buffer

  /** guard for decode(): only a too short payload is an error, extra bytes are tolerated */
  protected requireSize(payload: Buffer) {
    if (this.size !== undefined && payload.length < this.size) {
      throw new RangeError(`${this.name} payload needs ${this.size} bytes, got ${payload.length}`)
    }
  }

  /** guard for encode(): rejects NaN and fractions as well as out-of-range values */
  protected requireInteger(field: string, value: number, min: number, max: number) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${this.name}.${field} must be an integer between ${min} and ${max}, got ${value}`)
    }
  }

  /** guard for encode() against callers that bypass the type system (JSON, plugins) */
  protected requireType(value: unknown, type: "boolean" | "number" | "string" | "object") {
    if (typeof value !== type || value === null) {
      throw new TypeError(`${this.name} expects a ${type}, got ${value === null ? "null" : typeof value}`)
    }
  }
}
