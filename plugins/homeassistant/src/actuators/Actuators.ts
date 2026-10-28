import { DateTimeActuator } from "./DateTimeActuator.ts"
import type { EntityActuatorClass } from "./EntityActuator.ts"
import { LightBrightnessActuator } from "./LightBrightnessActuator.ts"
import { LightColorActuator } from "./LightColorActuator.ts"
import { LightTemperatureActuator } from "./LightTemperatureActuator.ts"
import { NumberActuator } from "./NumberActuator.ts"
import { OnOffActuator } from "./OnOffActuator.ts"
import { PositionActuator } from "./PositionActuator.ts"
import { ServiceCallActuator } from "./ServiceCallActuator.ts"
import { TemperatureActuator } from "./TemperatureActuator.ts"
import { TextActuator } from "./TextActuator.ts"
import { TiltActuator } from "./TiltActuator.ts"
import { TodoActuator } from "./TodoActuator.ts"
import { TriggerActuator } from "./TriggerActuator.ts"

/** Every actuator the plugin offers; the catalog offers each entity those that fit it. */
export class Actuators {
  static readonly forEntities: readonly EntityActuatorClass[] = [
    OnOffActuator, TriggerActuator, LightBrightnessActuator, LightColorActuator, LightTemperatureActuator,
    PositionActuator, TiltActuator, TemperatureActuator, NumberActuator, TextActuator, DateTimeActuator, TodoActuator
  ]

  static readonly all = [
    OnOffActuator, TriggerActuator, LightBrightnessActuator, LightColorActuator, LightTemperatureActuator,
    PositionActuator, TiltActuator, TemperatureActuator, NumberActuator, TextActuator, DateTimeActuator, TodoActuator,
    ServiceCallActuator
  ]
}
