import { z } from "@lox-nexus/plugin-sdk"
import type { HassConnection } from "../connection/HassConnection.ts"

const AreaSchema = z.object({ area_id: z.string(), name: z.string() })
const DeviceSchema = z.object({
  id: z.string(),
  area_id: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  name_by_user: z.string().nullable().optional(),
  disabled_by: z.string().nullable().optional(),
  // e.g. [["zha", "00:15:8d:…"]]: the integration comes first; an odd shape mustn't drop the device's area
  identifiers: z.array(z.array(z.unknown())).catch([])
})
const EntitySchema = z.object({
  entity_id: z.string(),
  area_id: z.string().nullable().optional(),
  device_id: z.string().nullable().optional(),
  hidden_by: z.string().nullable().optional(),
  disabled_by: z.string().nullable().optional()
})
const list = <T extends z.ZodType>(item: T) => z.array(z.unknown()).transform(items => items.flatMap(raw => {
  const parsed = item.safeParse(raw)
  return parsed.success ? [parsed.data as z.infer<T>] : []
}))

/**
 * Home Assistant's area, device and entity registries, read for the catalog: which area an
 * entity is in (its own, or its device's), which entities the user hid or disabled, and which
 * devices an integration has (for their events).
 * Entities without a registry entry (e.g. defined in YAML) have no area and are never hidden.
 */
export class Registries {
  private constructor(
    private readonly areas: Map<string, string>,
    private readonly devices: Map<string, z.infer<typeof DeviceSchema>>,
    private readonly entities: Map<string, z.infer<typeof EntitySchema>>
  ) {}

  /** @throws Error while disconnected or when a registry can't be read */
  static async load(connection: Pick<HassConnection, "request">) {
    const [areas, devices, entities] = await Promise.all([
      connection.request({ type: "config/area_registry/list" }).then(raw => list(AreaSchema).parse(raw)),
      connection.request({ type: "config/device_registry/list" }).then(raw => list(DeviceSchema).parse(raw)),
      connection.request({ type: "config/entity_registry/list" }).then(raw => list(EntitySchema).parse(raw))
    ])
    return new Registries(
      new Map(areas.map(area => [area.area_id, area.name])),
      new Map(devices.map(device => [device.id, device])),
      new Map(entities.map(entity => [entity.entity_id, entity]))
    )
  }

  /** the area's name, undefined for none */
  areaOf(entityId: string) {
    const entity = this.entities.get(entityId)
    const areaId = entity?.area_id ?? (entity?.device_id ? this.devices.get(entity.device_id)?.area_id : undefined)
    return areaId ? this.areas.get(areaId) : undefined
  }

  /** the enabled devices an integration identifies (e.g. "zha"), with the name the user sees */
  devicesOf(integration: string) {
    return [...this.devices.values()]
      .filter(device => !device.disabled_by && device.identifiers.some(identifier => identifier[0] === integration))
      .map(device => ({ id: device.id, name: device.name_by_user || device.name || device.id }))
  }

  hidden(entityId: string) {
    const entity = this.entities.get(entityId)
    return Boolean(entity?.hidden_by || entity?.disabled_by)
  }
}
