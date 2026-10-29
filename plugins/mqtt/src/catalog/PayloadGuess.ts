import type { CatalogEntry } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { JsonPath } from "../payload/JsonPath.ts"
import { NumberSensor } from "../sensors/NumberSensor.ts"
import { SwitchSensor } from "../sensors/SwitchSensor.ts"
import type { CachedTopic } from "./TopicCache.ts"

/** what a topic offers: one plain entry, or the fields of a JSON object */
export type Guess = { kind: "plain"; entry: CatalogEntry } | { kind: "json"; entries: CatalogEntry[] }

/**
 * Guesses how to read a topic from its last payload: a number if it is one, on/off for switch
 * words, the fields of a JSON object (numbers, on/off and text, nested objects as dotted paths),
 * else text. Only a guess: the user can change the sensor after adding it.
 */
export class PayloadGuess {
  static readonly MAX_FIELDS = 20
  static readonly MAX_DEPTH = 3
  static readonly PREVIEW = 200

  static of(cached: CachedTopic): Guess {
    const object = cached.clipped ? undefined : PayloadGuess.object(cached.payload)
    if (!object) return { kind: "plain", entry: PayloadGuess.entry(cached.topic, cached.topic, cached.payload, cached.clipped) }
    const entries = [PayloadGuess.textEntry(cached.topic, `${cached.topic} (JSON)`, { read: "json", path: "" }, cached.payload)]
    PayloadGuess.fields(cached.topic, object, "", 1, entries)
    return { kind: "json", entries }
  }

  private static entry(topic: string, label: string, text: string, clipped: boolean): CatalogEntry {
    const number = clipped ? undefined : NumberSensor.parse(text)
    if (number !== undefined) return PayloadGuess.sensor("number", label, { topic }, Value.number(number))
    const state = SwitchSensor.words.get(text.trim().toLowerCase())
    if (state !== undefined && !clipped) return PayloadGuess.sensor("switch", label, { topic }, Value.boolean(state))
    return PayloadGuess.textEntry(topic, label, {}, text)
  }

  private static fields(topic: string, object: Record<string, unknown>, prefix: string, depth: number, entries: CatalogEntry[]) {
    for (const [key, raw] of Object.entries(object)) {
      if (entries.length > PayloadGuess.MAX_FIELDS) return
      // a key a path can't name (or one JsonPath refuses, like __proto__) is left out; the whole JSON entry still has it
      if (/[.[\]]/.test(key) || key === "") continue
      const path = prefix ? `${prefix}.${key}` : key
      if (JsonPath.problem(path)) continue
      const label = `${topic} ${path}`
      const params = { topic, read: "json", path }
      if (typeof raw === "number") entries.push(PayloadGuess.sensor("number", label, params, Value.number(raw)))
      else if (typeof raw === "boolean") entries.push(PayloadGuess.sensor("switch", label, params, Value.boolean(raw)))
      else if (typeof raw === "string") entries.push(PayloadGuess.stringField(label, params, raw))
      else if (PayloadGuess.isObject(raw) && depth < PayloadGuess.MAX_DEPTH) PayloadGuess.fields(topic, raw, path, depth + 1, entries)
    }
  }

  private static stringField(label: string, params: Record<string, string>, raw: string) {
    const state = SwitchSensor.words.get(raw.trim().toLowerCase())
    if (state !== undefined) return PayloadGuess.sensor("switch", label, params, Value.boolean(state))
    return PayloadGuess.sensor("text", label, params, Value.string(raw.slice(0, PayloadGuess.PREVIEW)))
  }

  private static textEntry(topic: string, label: string, params: Record<string, string>, text: string) {
    const preview = text.length > PayloadGuess.PREVIEW ? `${text.slice(0, PayloadGuess.PREVIEW)}…` : text
    return PayloadGuess.sensor("text", label, { topic, ...params }, Value.string(preview))
  }

  private static sensor(capability: string, label: string, params: Record<string, string>, value: Value): CatalogEntry {
    return { kind: "sensor", capability, label, params, value }
  }

  private static object(text: string): Record<string, unknown> | undefined {
    if (!text.trimStart().startsWith("{")) return undefined
    try {
      const parsed: unknown = JSON.parse(text)
      return PayloadGuess.isObject(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }

  private static isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
