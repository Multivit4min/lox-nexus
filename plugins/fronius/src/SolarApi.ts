import { z } from "@lox-nexus/plugin-sdk"
import type { MeterData, PowerFlowData, StorageData } from "./SolarApiTypes.ts"

const envelopeSchema = z.object({
  Head: z.looseObject({
    Status: z.looseObject({ Code: z.number(), Reason: z.string().optional(), UserMessage: z.string().optional() }).optional()
  }).optional(),
  Body: z.looseObject({ Data: z.unknown().optional() })
})

// Only the structure the plugin relies on is checked; the fields themselves vary between devices.
const powerFlowSchema = z.looseObject({ Site: z.looseObject({}) })
const meterSchema = z.looseObject({})
const storageSchema = z.looseObject({ Controller: z.looseObject({}) })

/**
 * Client for the Fronius Solar API v1 (read-only, unauthenticated HTTP) of an inverter or
 * Datamanager. Every call has its own timeout and rejects with a message fit for a status line.
 */
export class SolarApi {
  private readonly base: string

  /** @param host e.g. "http://192.168.1.50"; a path is kept, so a reverse proxy prefix works */
  constructor(host: string, private readonly timeoutMs: number) {
    this.base = host.endsWith("/") ? host : `${host}/`
  }

  /** site, inverters and smart loads in one call; the only endpoint every system has */
  powerFlow(signal?: AbortSignal): Promise<PowerFlowData> {
    return this.get("GetPowerFlowRealtimeData.fcgi", {}, powerFlowSchema, signal) as Promise<PowerFlowData>
  }

  /** all meters of the system, by device id */
  meters(signal?: AbortSignal): Promise<Record<string, MeterData>> {
    return this.get("GetMeterRealtimeData.cgi", SolarApi.scope(), z.record(z.string(), meterSchema), signal) as Promise<Record<string, MeterData>>
  }

  /** one meter; device ids start at 0. @throws RangeError for a negative or fractional id */
  meter(deviceId: number, signal?: AbortSignal): Promise<MeterData> {
    return this.get("GetMeterRealtimeData.cgi", SolarApi.scope(deviceId), meterSchema, signal) as Promise<MeterData>
  }

  /** all storages (batteries) of the system, by device id */
  storages(signal?: AbortSignal): Promise<Record<string, StorageData>> {
    return this.get("GetStorageRealtimeData.cgi", SolarApi.scope(), z.record(z.string(), storageSchema), signal) as Promise<Record<string, StorageData>>
  }

  /** one storage; device ids start at 0. @throws RangeError for a negative or fractional id */
  storage(deviceId: number, signal?: AbortSignal): Promise<StorageData> {
    return this.get("GetStorageRealtimeData.cgi", SolarApi.scope(deviceId), storageSchema, signal) as Promise<StorageData>
  }

  /** @returns Body.Data, checked against the schema; @throws Error naming the endpoint and what went wrong */
  private async get(endpoint: string, query: Record<string, string>, schema: z.ZodType, signal?: AbortSignal): Promise<unknown> {
    const name = endpoint.replace(/\..*$/, "")
    try {
      const data = await this.request(endpoint, query, signal)
      const parsed = schema.safeParse(data)
      if (!parsed.success) throw new Error(`unexpected response: ${z.prettifyError(parsed.error)}`)
      return parsed.data
    } catch (error) {
      throw new Error(`${name}: ${SolarApi.describe(error, this.timeoutMs)}`, { cause: error })
    }
  }

  private async request(endpoint: string, query: Record<string, string>, signal?: AbortSignal) {
    const url = new URL(`solar_api/v1/${endpoint}`, this.base)
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      // a fresh connection per poll: polls are seconds apart, and a pooled keep-alive socket would
      // outlive the plugin's stop
      headers: { accept: "application/json", connection: "close" }
    })
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new Error(`HTTP ${response.status}`)
    }
    // the content type isn't trusted: older Datamanager devices answer JSON as text/javascript
    const text = await response.text()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`expected JSON, got ${response.headers.get("content-type") ?? "no content type"}: ${JSON.stringify(text.slice(0, 60))}`)
    }
    return SolarApi.data(body)
  }

  /** unwraps the envelope; a Head.Status.Code other than 0 is the device saying no */
  private static data(json: unknown) {
    const envelope = envelopeSchema.safeParse(json)
    if (!envelope.success) throw new Error("response has no Body")
    const status = envelope.data.Head?.Status
    if (status && status.Code !== 0) {
      const reason = status.UserMessage || status.Reason
      throw new Error(`device answered with status ${status.Code}${reason ? ` (${reason})` : ""}`)
    }
    if (envelope.data.Body.Data === undefined) throw new Error("response has no Body.Data")
    return envelope.data.Body.Data
  }

  // device 0 is a valid id (the first meter or battery), so only an absent id means the whole system
  private static scope(deviceId?: number): Record<string, string> {
    if (deviceId === undefined) return { Scope: "System" }
    if (!Number.isInteger(deviceId) || deviceId < 0) throw new RangeError(`device id must be an integer >= 0, got ${deviceId}`)
    return { Scope: "Device", DeviceId: String(deviceId) }
  }

  private static describe(error: unknown, timeoutMs: number): string {
    if (!(error instanceof Error)) return String(error)
    if (error.name === "TimeoutError") return `no answer within ${timeoutMs / 1000} s`
    // fetch reports network errors as "fetch failed" with the useful part in the cause
    if (error.cause instanceof Error) return `unreachable (${error.cause.message})`
    return error.message
  }
}
