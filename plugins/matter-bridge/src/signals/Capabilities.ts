import type { CommandKind, StateKind } from "../devices/DeviceKinds.ts"
import { BrightnessCommand } from "./BrightnessCommand.ts"
import { BrightnessState } from "./BrightnessState.ts"
import { ContactState } from "./ContactState.ts"
import { HumidityState } from "./HumidityState.ts"
import { OccupancyState } from "./OccupancyState.ts"
import { OnOffCommand } from "./OnOffCommand.ts"
import { OnOffState } from "./OnOffState.ts"
import { PositionCommand } from "./PositionCommand.ts"
import { PositionState } from "./PositionState.ts"
import { SetpointCommand } from "./SetpointCommand.ts"
import { SetpointState } from "./SetpointState.ts"
import { TemperatureState } from "./TemperatureState.ts"

/** The sensor for each kind of command and the actuator for each kind of state. */
export class Capabilities {
  static readonly sensorFor = {
    onOff: OnOffCommand, brightness: BrightnessCommand, position: PositionCommand, setpoint: SetpointCommand
  } as const satisfies Record<CommandKind, unknown>

  static readonly actuatorFor = {
    onOff: OnOffState, brightness: BrightnessState, position: PositionState, temperature: TemperatureState,
    humidity: HumidityState, contact: ContactState, occupancy: OccupancyState, setpoint: SetpointState
  } as const satisfies Record<StateKind, unknown>

  static readonly sensors = Object.values(Capabilities.sensorFor)
  static readonly actuators = Object.values(Capabilities.actuatorFor)
}
