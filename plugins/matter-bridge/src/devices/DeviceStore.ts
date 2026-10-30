import { z, type PluginLogger, type PluginStore } from "@lox-nexus/plugin-sdk"
import { DEVICE_TYPE_IDS } from "./DeviceKinds.ts"
import { deviceRecordSchema, type DeviceRecord } from "./DeviceRecord.ts"

/** the device list of the first versions, which lived in the instance config */
const legacyConfigSchema = z.object({ devices: z.array(z.object({ name: z.string().trim().min(1), type: z.enum(DEVICE_TYPE_IDS) })) })

/**
 * The devices of the bridge, in the plugin store (`devices`). Managed with the device actions; a
 * damaged entry is skipped with a warning instead of failing the start.
 */
export class DeviceStore {
  static readonly KEY = "devices"

  constructor(private readonly store: PluginStore, private readonly log: PluginLogger) {}

  load(): DeviceRecord[] {
    const raw = this.store.get(DeviceStore.KEY)
    if (raw === undefined) return []
    if (!Array.isArray(raw)) {
      this.log.warn("ignored the stored device list: not a list")
      return []
    }
    return raw.flatMap(entry => {
      const parsed = deviceRecordSchema.safeParse(entry)
      if (!parsed.success) this.log.warn(`ignored a damaged stored device: ${JSON.stringify(entry).slice(0, 200)}`)
      return parsed.success ? [parsed.data] : []
    })
  }

  save(records: readonly DeviceRecord[]) {
    this.store.set(DeviceStore.KEY, records)
  }

  /**
   * Config version 1 kept the device list in the settings: it moves into the store once (when
   * nothing is stored yet), and the config is returned without it. Each device keeps its Matter
   * identity (derived from type and name, as before) and gets its name as id, which is what its
   * signals refer to.
   */
  static takeOver(store: PluginStore, config: unknown): unknown {
    const { devices, ...rest } = config && typeof config === "object" ? config as { devices?: unknown } : {}
    const legacy = legacyConfigSchema.safeParse({ devices })
    if (store.get(DeviceStore.KEY) === undefined && legacy.success && legacy.data.devices.length > 0) {
      store.set(DeviceStore.KEY, legacy.data.devices.map(({ name, type }) => ({ id: name, name, type, allowUnlock: false, seed: `${type}\n${name}` })))
    }
    return rest
  }
}
