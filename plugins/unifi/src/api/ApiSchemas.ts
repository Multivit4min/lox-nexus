import { z } from "@lox-nexus/plugin-sdk"

// The parts of the UniFi Network API 10.3.58 schemas the plugin reads, named after the spec's
// schemas. Objects are loose (unknown fields pass), and enums the spec may extend are read as
// strings, so a newer Network version doesn't break the poll.

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
  ipAddress: z.string().optional(),
  connectedAt: z.string().optional(),
  macAddress: z.string().optional(),
  uplinkDeviceId: z.string().optional(),
  access: z.looseObject({ type: z.string(), authorized: z.boolean().optional() })
})

/** "Adopted device overview"; `state` is an enum in the spec (ONLINE, OFFLINE, UPDATING, …) */
export const deviceSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  macAddress: z.string(),
  ipAddress: z.string().optional(),
  state: z.string(),
  firmwareVersion: z.string().optional(),
  firmwareUpdatable: z.boolean(),
  features: z.array(z.string()),
  interfaces: z.array(z.string())
})

/** "Port PoE overview"; `state` says whether the port supplies power now (UP, DOWN, LIMITED, UNKNOWN) */
export const portPoeSchema = z.looseObject({ enabled: z.boolean(), state: z.string(), standard: z.string().optional() })

/** "Port overview" of "Device physical interfaces" */
export const portSchema = z.looseObject({
  idx: z.number().int(),
  state: z.string(),
  connector: z.string(),
  maxSpeedMbps: z.number(),
  speedMbps: z.number().optional(),
  poe: portPoeSchema.optional()
})

/** "Adopted device details": only the ports are read from it */
export const deviceDetailsSchema = z.looseObject({
  id: z.string(),
  interfaces: z.looseObject({ ports: z.array(portSchema).optional() })
})

/** "Latest statistics for a device"; the rates are bits per second, like the API's Kbps fields */
export const statisticsSchema = z.looseObject({
  uptimeSec: z.number().optional(),
  cpuUtilizationPct: z.number().optional(),
  memoryUtilizationPct: z.number().optional(),
  uplink: z.looseObject({ rxRateBps: z.number().optional(), txRateBps: z.number().optional() }).optional()
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
  authorizedGuestLimit: z.number().optional(),
  activatedAt: z.string().optional(),
  expiresAt: z.string().optional()
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
