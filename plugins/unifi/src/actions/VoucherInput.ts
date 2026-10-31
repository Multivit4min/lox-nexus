import { z } from "@lox-nexus/plugin-sdk"
import type { VoucherRequest } from "../api/NetworkApi.ts"

// the limits are those of "Hotspot voucher creation request"
const rate = z.number().int().min(2).max(100_000).optional()

/** The Create voucher form. */
export const voucherInput = z.object({
  minutes: z.number().int().min(1).max(1_000_000).default(1440).meta({ title: "Valid for (minutes)", description: "Counted from the first guest's login; 1440 is a day" }),
  guests: z.number().int().min(1).optional().meta({ title: "Guests", description: "How many guests may use it. Empty: any number" }),
  note: z.string().min(1).default("Nexus").meta({ title: "Note", description: "Shown with the voucher on the console" }),
  dataLimitMB: z.number().int().min(1).max(1_048_576).optional().meta({ title: "Data limit (MB)", description: "Empty: none" }),
  downloadKbps: rate.meta({ title: "Download limit (kbit/s)", description: "Empty: none" }),
  uploadKbps: rate.meta({ title: "Upload limit (kbit/s)", description: "Empty: none" })
})

export type VoucherInput = z.infer<typeof voucherInput>

/** the API's request for a form's values; optional limits are left out, not sent empty */
export function voucherRequest(input: VoucherInput): VoucherRequest {
  return {
    name: input.note,
    timeLimitMinutes: input.minutes,
    ...(input.guests === undefined ? {} : { authorizedGuestLimit: input.guests }),
    ...(input.dataLimitMB === undefined ? {} : { dataUsageLimitMBytes: input.dataLimitMB }),
    ...(input.downloadKbps === undefined ? {} : { rxRateLimitKbps: input.downloadKbps }),
    ...(input.uploadKbps === undefined ? {} : { txRateLimitKbps: input.uploadKbps })
  }
}
