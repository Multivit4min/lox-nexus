import { z } from "@lox-nexus/plugin-sdk"

// The parts of the UniFi Network API 10.3.58 schemas the plugin reads, named after the spec's
// schemas. Objects are loose (unknown fields pass), and enums the spec may extend are read as
// strings, so a newer Network version doesn't break the poll.

/**
 * An optional field that may also come as null, read as missing: consoles send null where the
 * spec leaves a field out (an empty SFP cage's speeds, a statistic a device doesn't measure).
 */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => (value === null ? undefined : value), schema.optional())

/** "Application info" (GET /v1/info) */
export const applicationInfoSchema = z.looseObject({ applicationVersion: z.string() })

/** "Site overview" */
export const siteSchema = z.looseObject({ id: z.string(), internalReference: z.string(), name: z.string() })

/**
 * "Client overview" with the fields of its WIRED and WIRELESS subtypes (macAddress, uplinkDeviceId);
 * VPN and TELEPORT clients have neither. `access` is "Client access overview": type GUEST carries
 * `authorized`, DEFAULT nothing more.
 */
export const clientSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  ipAddress: optional(z.string()),
  connectedAt: optional(z.string()),
  macAddress: optional(z.string()),
  uplinkDeviceId: optional(z.string()),
  access: z.looseObject({ type: z.string(), authorized: optional(z.boolean()) })
})

/** "Adopted device overview"; `state` is an enum in the spec (ONLINE, OFFLINE, UPDATING, …) */
export const deviceSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  macAddress: z.string(),
  ipAddress: optional(z.string()),
  state: z.string(),
  firmwareVersion: optional(z.string()),
  firmwareUpdatable: z.boolean(),
  features: z.array(z.string()),
  interfaces: z.array(z.string())
})

/** "Port PoE overview"; `state` says whether the port supplies power now (UP, DOWN, LIMITED, UNKNOWN) */
export const portPoeSchema = z.looseObject({ enabled: z.boolean(), state: z.string(), standard: optional(z.string()) })

/** "Port overview" of "Device physical interfaces" */
export const portSchema = z.looseObject({
  idx: z.number().int(),
  state: z.string(),
  connector: z.string(),
  // required by the spec, missing or null on some consoles' SFP cages
  maxSpeedMbps: optional(z.number()),
  speedMbps: optional(z.number()),
  poe: optional(portPoeSchema)
})

/**
 * "Adopted device details": only the ports are read from it, each on its own: a port this version
 * doesn't understand is left out (and counted) instead of losing every port of the device.
 */
export const deviceDetailsSchema = z.looseObject({
  id: z.string(),
  interfaces: z.looseObject({
    ports: optional(z.array(z.unknown())).transform(ports => {
      const parsed = (ports ?? []).map(port => ({ port, result: portSchema.safeParse(port) }))
      return {
        ports: parsed.flatMap(({ result }) => (result.success ? [result.data] : [])),
        // which port and which field, for the debug log: "port 25: maxSpeedMbps expected number"
        skipped: parsed.flatMap(({ port, result }) => {
          if (result.success) return []
          const issue = result.error.issues[0]
          return [`port ${String((port as { idx?: unknown } | null)?.idx ?? "?")}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "not readable"}`.trim()]
        })
      }
    })
  })
})

/** "Latest statistics for a device"; the rates are bits per second, like the API's Kbps fields */
export const statisticsSchema = z.looseObject({
  uptimeSec: optional(z.number()),
  cpuUtilizationPct: optional(z.number()),
  memoryUtilizationPct: optional(z.number()),
  uplink: optional(z.looseObject({ rxRateBps: optional(z.number()), txRateBps: optional(z.number()) }))
})

/** "Wifi broadcast overview" */
export const wifiOverviewSchema = z.looseObject({ id: z.string(), name: z.string(), type: z.string(), enabled: z.boolean() })

/** "Wifi broadcast details": every field is kept, because PUT needs the full object back */
export const wifiDetailsSchema = z.looseObject({ id: z.string(), name: z.string(), type: z.string(), enabled: z.boolean() })

/** "Hotspot voucher details" */
export const voucherSchema = z.looseObject({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  createdAt: z.string(),
  expired: z.boolean(),
  timeLimitMinutes: z.number(),
  authorizedGuestCount: z.number(),
  authorizedGuestLimit: optional(z.number()),
  activatedAt: optional(z.string()),
  expiresAt: optional(z.string())
})

/** "IntegrationVoucherCreationResultDto" */
export const voucherCreationSchema = z.looseObject({ vouchers: z.array(voucherSchema).default([]) })

/** "Voucher deletion results" */
export const voucherDeletionSchema = z.looseObject({ vouchersDeleted: z.number().default(0) })

export type Site = z.infer<typeof siteSchema>
export type Client = z.infer<typeof clientSchema>
export type Device = z.infer<typeof deviceSchema>
export type Port = z.infer<typeof portSchema>
export type DeviceDetails = z.infer<typeof deviceDetailsSchema>
export type Statistics = z.infer<typeof statisticsSchema>
export type WifiOverview = z.infer<typeof wifiOverviewSchema>
export type WifiDetails = z.infer<typeof wifiDetailsSchema>
export type Voucher = z.infer<typeof voucherSchema>
