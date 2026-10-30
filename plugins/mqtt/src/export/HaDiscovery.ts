import type { WatchedSignal } from "@lox-nexus/plugin-sdk"

/** who the exported signals belong to in Home Assistant: one device per plugin instance */
export interface DiscoveryDevice {
  /** stable per instance; part of every unique_id */
  instanceId: string
  name: string
}

/** state templates of structured values; their whole JSON goes to the attributes */
const STRUCTURED: Record<string, { template: string; unit?: string }> = {
  singleChannel: { template: "{{ value_json.channel }}", unit: "%" },
  tunableWhite: { template: "{{ value_json.brightness }}", unit: "%" },
  rgbw: { template: "{{ [value_json.red, value_json.green, value_json.blue, value_json.white] | max }}", unit: "%" },
  t5: { template: "{{ value_json.buttons }}" }
}

/**
 * Home Assistant MQTT discovery configs for exported signals: read-only entities, a binary_sensor
 * for on/off signals and a sensor for the rest, under `<prefix>/<component>/<node>/<signal>/config`.
 * The unique_id comes from the instance and the signal id, so renaming a signal keeps the entity.
 */
export class HaDiscovery {
  constructor(private readonly prefix: string, private readonly device: DiscoveryDevice, private readonly statusTopic: string | undefined) {}

  topic(signal: WatchedSignal) {
    const node = HaDiscovery.id(`lox_nexus_${this.device.instanceId}`)
    return `${this.prefix}/${HaDiscovery.component(signal)}/${node}/${HaDiscovery.id(signal.id)}/config`
  }

  payload(signal: WatchedSignal, stateTopic: string) {
    const config: Record<string, unknown> = {
      name: signal.label || signal.topic,
      unique_id: HaDiscovery.id(`lox_nexus_${this.device.instanceId}_${signal.id}`),
      state_topic: stateTopic,
      device: {
        identifiers: [HaDiscovery.id(`lox_nexus_${this.device.instanceId}`)],
        name: this.device.name,
        manufacturer: "Lox Nexus",
        model: "MQTT export"
      },
      origin: { name: "Lox Nexus" }
    }
    if (this.statusTopic) Object.assign(config, { availability_topic: this.statusTopic, payload_available: "online", payload_not_available: "offline" })
    Object.assign(config, HaDiscovery.typed(signal, stateTopic))
    return JSON.stringify(config)
  }

  private static typed(signal: WatchedSignal, stateTopic: string): Record<string, unknown> {
    if (signal.valueType === "boolean") return { payload_on: "true", payload_off: "false" }
    if (signal.valueType === "number") return { state_class: "measurement", ...HaDiscovery.display(signal) }
    const structured = STRUCTURED[signal.valueType]
    if (!structured) return {}
    // the template's output has its own unit; the signal's is for plain numbers
    return {
      value_template: structured.template,
      json_attributes_topic: stateTopic,
      ...structured.unit ? { unit_of_measurement: structured.unit } : {}
    }
  }

  // the unit and decimals the user gave the signal in Nexus
  private static display(signal: WatchedSignal) {
    return {
      ...signal.unit ? { unit_of_measurement: signal.unit } : {},
      ...signal.decimals === undefined ? {} : { suggested_display_precision: signal.decimals }
    }
  }

  private static component(signal: WatchedSignal) {
    return signal.valueType === "boolean" ? "binary_sensor" : "sensor"
  }

  /** node ids, object ids and unique ids: letters, digits, _ and - */
  static id(text: string) {
    return text.replace(/[^a-zA-Z0-9_-]/g, "_")
  }
}
