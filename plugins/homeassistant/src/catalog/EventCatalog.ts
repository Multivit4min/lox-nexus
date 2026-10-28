import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { EventSensor } from "../sensors/EventSensor.ts"
import type { Registries } from "./Registries.ts"

/** a well-known event type: which integration fires it, and which data field tells its buttons (or actions) apart */
interface KnownEvent {
  eventType: string
  label: string
  field: string
  /** shown only when this integration has devices; always when undefined */
  integration?: string
  /** its data carries the device_id, so each device can be offered on its own */
  perDevice: boolean
}

/** button and remote events of common integrations; newer integrations use event entities, which the entity tree covers */
const KNOWN: readonly KnownEvent[] = [
  { eventType: "zha_event", label: "ZHA", field: "command", integration: "zha", perDevice: true },
  { eventType: "deconz_event", label: "deCONZ", field: "event", integration: "deconz", perDevice: true },
  { eventType: "hue_event", label: "Philips Hue", field: "subtype", integration: "hue", perDevice: true },
  { eventType: "lutron_caseta_button_event", label: "Lutron Caséta", field: "button_number", integration: "lutron_caseta", perDevice: true },
  { eventType: "mobile_app_notification_action", label: "Notification actions", field: "action", integration: "mobile_app", perDevice: false },
  { eventType: "tag_scanned", label: "Tags", field: "tag_id", perDevice: false }
]

/**
 * The "Events" node of the catalog: common event types, each with an entry for all its events and,
 * where the event names its device, one per device of the integration. The entries send the data
 * field that tells the buttons apart (a ZHA command, a Hue button number); a filter on it, or a
 * pulse, is a sensor the user adds with those params.
 */
export class EventCatalog {
  static readonly LABEL = "Events"

  constructor(private readonly registries: Pick<Registries, "devicesOf">) {}

  build(): CatalogNode[] {
    const children = KNOWN.flatMap(known => {
      const devices = known.integration === undefined ? [] : this.registries.devicesOf(known.integration)
      if (known.integration !== undefined && devices.length === 0) return []
      const all = EventCatalog.entry(known, `${known.label} ${known.field}`)
      const each = known.perDevice ? devices.map(device => EventCatalog.entry(known, `${device.name} ${known.field}`, { device_id: device.id })) : []
      return [{ label: `${known.label} (${known.eventType})`, entries: [all, ...each.sort((a, b) => a.label.localeCompare(b.label))] }]
    })
    return children.length === 0 ? [] : [{ label: EventCatalog.LABEL, children }]
  }

  private static entry({ eventType, field }: KnownEvent, label: string, filter?: Record<string, string>): CatalogEntry {
    return { kind: "sensor", capability: EventSensor.id, params: { eventType, field, ...(filter ? { filter } : {}) }, label }
  }
}
