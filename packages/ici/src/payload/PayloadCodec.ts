import type { DataType } from "../DataType.ts"

/** Converts between the payload bytes of one data type and its JavaScript value. */
export abstract class PayloadCodec<T> {
  abstract readonly dataType: DataType
  abstract readonly name: string
  /** fixed payload size in bytes, undefined for variable length payloads */
  abstract readonly size: number | undefined

  /** throws RangeError if the payload is too short */
  abstract decode(payload: Buffer): T

  /** throws RangeError or TypeError if the value can't be represented */
  abstract encode(value: T): Buffer

  protected requireSize(payload: Buffer) {
    if (this.size !== undefined && payload.length < this.size) {
      throw new RangeError(`${this.name} payload needs ${this.size} bytes, got ${payload.length}`)
    }
  }

  protected requireInteger(field: string, value: number, min: number, max: number) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new RangeError(`${this.name}.${field} must be an integer between ${min} and ${max}, got ${value}`)
    }
  }

  protected requireType(value: unknown, type: "boolean" | "number" | "string" | "object") {
    if (typeof value !== type || value === null) {
      throw new TypeError(`${this.name} expects a ${type}, got ${value === null ? "null" : typeof value}`)
    }
  }
}
