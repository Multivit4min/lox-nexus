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
        id: sensor.id, label: Declarations.label(sensor), ...Declarations.description(sensor), params: PluginDescriber.schemaOf(Declarations.params(sensor)), valueType: Declarations.valueType(sensor)
      })),
      actuators: Declarations.actuators(type).map(actuator => ({
        id: actuator.id, label: Declarations.label(actuator), ...Declarations.description(actuator), params: PluginDescriber.schemaOf(Declarations.params(actuator)), valueType: Declarations.accepts(actuator)
      })),
      ...Declarations.watches(type)
    }
  }

  /** @throws Error for a sensor or actuator without an id, two with the same id, or an invalid `watches` */
  static assertValid(type: PluginClass) {
    if (type.watches !== undefined && !WatchDeclarationSchema.safeParse(type.watches).success) throw new Error(`${type.name}: static watches needs a label (1 to 100 characters)`)
    for (const [kind, list] of [["sensor", Declarations.sensors(type)], ["actuator", Declarations.actuators(type)]] as const) {
      const seen = new Set<string>()
      for (const capability of list) {
        if (!capability.id) throw new Error(`${type.name}: ${kind} ${capability.name} has no static id`)
        if (seen.has(capability.id)) throw new Error(`${type.name}: two ${kind}s have the id "${capability.id}"`)
        seen.add(capability.id)
      }
    }
  }

  // input side: what a user types, before defaults and transforms; transforms can't be described
  private static schemaOf(schema: z.ZodType): JsonSchema {
    return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema
  }
}
