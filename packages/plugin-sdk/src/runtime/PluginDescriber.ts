import { z } from "zod"
import type { PluginClass } from "../plugin/Plugin.ts"
import type { JsonSchema, PluginDescription } from "../wire/Shapes.ts"
import { WatchDeclarationSchema } from "../wire/WatchShapes.ts"
import { Declarations } from "./Declarations.ts"

/** Turns a plugin class's static declarations into a PluginDescription (JSON Schemas for UIs). */
export class PluginDescriber {
  /** @throws Error when the declarations are invalid, see assertValid() */
  static describe(type: PluginClass): PluginDescription {
    PluginDescriber.assertValid(type)
    return {
      config: PluginDescriber.schemaOf(Declarations.config(type)),
      sensors: Declarations.sensors(type).map(sensor => ({
        id: sensor.id, label: Declarations.label(sensor), ...Declarations.description(sensor), ...Declarations.display(sensor, "sensor"), params: PluginDescriber.schemaOf(Declarations.params(sensor)), valueType: Declarations.valueType(sensor)
      })),
      actuators: Declarations.actuators(type).map(actuator => ({
        id: actuator.id, label: Declarations.label(actuator), ...Declarations.description(actuator), ...Declarations.display(actuator, "actuator"), params: PluginDescriber.schemaOf(Declarations.params(actuator)), valueType: Declarations.accepts(actuator)
      })),
      ...Declarations.watches(type),
      ...PluginDescriber.actions(type),
      ...(typeof type.test === "function" ? { testable: true as const } : {})
    }
  }

  // absent without actions, so descriptions of plugins without them stay as they were
  private static actions(type: PluginClass) {
    const actions = Declarations.actions(type).map(action => ({
      id: action.id, label: Declarations.actionLabel(action), input: PluginDescriber.schemaOf(Declarations.actionInput(action)),
      ...(typeof action.description === "string" && action.description ? { description: action.description } : {}),
      ...(typeof action.confirm === "string" && action.confirm ? { confirm: action.confirm } : {})
    }))
    return actions.length > 0 ? { actions } : {}
  }

  /** @throws Error for a sensor, actuator or action without an id, two with the same id, or an invalid `watches` */
  static assertValid(type: PluginClass) {
    if (type.watches !== undefined && !WatchDeclarationSchema.safeParse(type.watches).success) throw new Error(`${type.name}: static watches needs a label (1 to 100 characters)`)
    for (const [kind, list] of [["sensor", Declarations.sensors(type)], ["actuator", Declarations.actuators(type)], ["action", Declarations.actions(type)]] as const) {
      const seen = new Set<string>()
      for (const capability of list) {
        if (!capability.id) throw new Error(`${type.name}: ${kind} ${capability.name} has no static id`)
        if (seen.has(capability.id)) throw new Error(`${type.name}: two ${kind}s have the id "${capability.id}"`)
        seen.add(capability.id)
      }
    }
    const { configVersion, migrateConfig, test } = type
    if (configVersion !== undefined && !(Number.isInteger(configVersion) && configVersion >= 1)) throw new Error(`${type.name}: static configVersion must be a whole number from 1`)
    if (migrateConfig !== undefined && typeof migrateConfig !== "function") throw new Error(`${type.name}: static migrateConfig must be a function`)
    if (test !== undefined && typeof test !== "function") throw new Error(`${type.name}: static test must be a function`)
  }

  // input side: what a user types, before defaults and transforms; transforms can't be described
  private static schemaOf(schema: z.ZodType): JsonSchema {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema
  }
}
