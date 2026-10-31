import type { DeviceTypeId } from "../devices/DeviceKinds.ts"

/** a choice in the Add device form: one type, or several close ones picked with a second choice */
export interface DeviceGroup {
  readonly id: string
  readonly label: string
  /**
   * groups of several types: the second choice's field (its own per group, as the form keeps a
   * field's value when another group with the same field is picked) and title
   */
  readonly choice?: { readonly field: string; readonly title: string }
  /** the types and how the second choice names them */
  readonly types: readonly { readonly type: DeviceTypeId; readonly label: string }[]
}

const one = (type: DeviceTypeId, label: string): DeviceGroup => ({ id: type, label, types: [{ type, label }] })

/**
 * The Add device form's type choice: close types (lights, thermostats, sensors, …) are one entry
 * with a second choice, so the list stays short. Stored devices keep their exact type; a group
 * with one type has the type's id, a group of several a name of its own.
 */
export class DeviceGroups {
  static readonly all: readonly DeviceGroup[] = [
    {
      id: "light", label: "Light", choice: { field: "light", title: "Kind of light" },
      types: [
        { type: "dimmable-light", label: "Dimmable" }, { type: "on-off-light", label: "On/off" },
        { type: "color-temperature-light", label: "Tunable white" }, { type: "color-light", label: "Colour (RGB)" }
      ]
    },
    { id: "plug", label: "Plug", choice: { field: "plug", title: "Kind of plug" }, types: [{ type: "plug", label: "On/off" }, { type: "dimmable-plug", label: "Dimmable" }] },
    {
      id: "wall-control", label: "Wall switch or dimmer", choice: { field: "wallControl", title: "Switch or dimmer" },
      types: [{ type: "wall-switch", label: "Switch (on/off)" }, { type: "wall-dimmer", label: "Dimmer" }]
    },
    {
      id: "blind", label: "Blind or shutter", choice: { field: "blind", title: "Kind of blind" },
      types: [{ type: "window-covering", label: "Position only" }, { type: "venetian-blind", label: "With slats (lift and tilt)" }]
    },
    {
      id: "thermostat", label: "Thermostat", choice: { field: "thermostat", title: "Heating or cooling" },
      types: [{ type: "thermostat", label: "Heating" }, { type: "thermostat-heat-cool", label: "Heating and cooling" }]
    },
    one("heat-pump", "Heat pump"),
    one("fan", "Fan"),
    one("water-valve", "Water valve"),
    one("door-lock", "Door lock"),
    {
      id: "sensor", label: "Sensor (measurement)", choice: { field: "sensor", title: "What it measures" },
      types: [
        { type: "temperature-sensor", label: "Temperature" }, { type: "humidity-sensor", label: "Humidity" },
        { type: "light-sensor", label: "Light (lux)" }, { type: "pressure-sensor", label: "Pressure" },
        { type: "flow-sensor", label: "Flow" }, { type: "air-quality-sensor", label: "Air quality (CO₂, PM2.5)" }
      ]
    },
    one("contact-sensor", "Contact sensor (door, window)"),
    one("occupancy-sensor", "Motion (occupancy) sensor"),
    {
      id: "water-sensor", label: "Leak, rain or frost sensor", choice: { field: "waterSensor", title: "What it detects" },
      types: [{ type: "water-leak-detector", label: "Water leak" }, { type: "rain-sensor", label: "Rain" }, { type: "water-freeze-detector", label: "Frost (water freeze)" }]
    },
    one("smoke-co-alarm", "Smoke and CO alarm"),
    { id: "button", label: "Button or doorbell", choice: { field: "button", title: "Button or doorbell" }, types: [{ type: "generic-switch", label: "Button" }, { type: "doorbell", label: "Doorbell" }] },
    one("chime", "Chime (bell)"),
    {
      id: "energy-meter", label: "Energy meter", choice: { field: "energyMeter", title: "What it measures" },
      types: [
        { type: "electrical-meter", label: "Electricity (grid)" }, { type: "solar-power", label: "Solar power (PV)" },
        { type: "battery-storage", label: "Battery storage" }
      ]
    },
    one("evse", "Wallbox (EV charger)")
  ]

  /** the type the form's input stands for: the group's type, or the one its second choice picked */
  static type(input: Record<string, unknown>): DeviceTypeId {
    const group = DeviceGroups.all.find(candidate => candidate.id === input.type)
    if (!group) throw new Error(`unknown device type "${String(input.type)}"`)
    if (!group.choice) return group.types[0]!.type
    const picked = group.types.find(entry => entry.type === input[group.choice!.field])
    if (!picked) throw new Error(`pick a kind of ${group.label.toLowerCase()}`)
    return picked.type
  }
}
