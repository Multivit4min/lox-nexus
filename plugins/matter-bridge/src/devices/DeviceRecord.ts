import { z } from "@lox-nexus/plugin-sdk"
import { nameSchema } from "../config/BridgeConfig.ts"
import { DEVICE_TYPE_IDS } from "./DeviceKinds.ts"

/** A device as the store keeps it. */
export const deviceRecordSchema = z.object({
  /** stable, given at creation; signals refer to it */
  id: z.string().min(1).max(64),
  name: nameSchema(),
  type: z.enum(DEVICE_TYPE_IDS),
  /** door locks: whether controllers may unlock */
  allowUnlock: z.boolean().default(false),
  /** what the Matter identity derives from when it isn't the id (devices taken over from the old config) */
  seed: z.string().optional()
})

export type DeviceRecord = z.infer<typeof deviceRecordSchema>
