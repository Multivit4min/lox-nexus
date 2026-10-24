import { z } from "zod"
import type { ActuatorClass } from "../plugin/Actuator.ts"
import type { PluginClass } from "../plugin/Plugin.ts"
import type { SensorClass } from "../plugin/Sensor.ts"

/** Reads a plugin's static declarations with their defaults, so they stay optional for authors. */
export class Declarations {
  /** used where a plugin or capability declares no schema: an empty object */
  static readonly NONE = z.object({})

  static config(type: PluginClass) {
    return type.config ?? Declarations.NONE
  }

  static sensors(type: PluginClass) {
    return type.sensors ?? []
  }

  static actuators(type: PluginClass) {
    return type.actuators ?? []
  }

  static params(capability: SensorClass | ActuatorClass) {
    return capability.params ?? Declarations.NONE
  }

  static label(capability: SensorClass | ActuatorClass) {
    return capability.label ?? capability.id
  }

  static valueType(sensor: SensorClass) {
    return sensor.valueType ?? "any"
  }

  static accepts(actuator: ActuatorClass) {
    return actuator.accepts ?? "any"
  }

  static concurrency(actuator: ActuatorClass) {
    return actuator.concurrency ?? "queue"
  }
}
