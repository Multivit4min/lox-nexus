import type { CommandKind, StateKind } from "../devices/DeviceKinds.ts"
import { BatteryState } from "./BatteryState.ts"
import { BrightnessCommand } from "./BrightnessCommand.ts"
import { BrightnessState } from "./BrightnessState.ts"
import { CoState } from "./CoState.ts"
import { ColorTemperatureCommand } from "./ColorTemperatureCommand.ts"
import { ColorTemperatureState } from "./ColorTemperatureState.ts"
import { ContactState } from "./ContactState.ts"
import { FanSpeedCommand } from "./FanSpeedCommand.ts"
import { FanSpeedState } from "./FanSpeedState.ts"
import { FlowState } from "./FlowState.ts"
import { FreezeState } from "./FreezeState.ts"
import { HumidityState } from "./HumidityState.ts"
import { IlluminanceState } from "./IlluminanceState.ts"
import { LeakState } from "./LeakState.ts"
import { LockCommand } from "./LockCommand.ts"
import { LockedState } from "./LockedState.ts"
import { LongPressState } from "./LongPressState.ts"
import { OccupancyState } from "./OccupancyState.ts"
import { OnOffCommand } from "./OnOffCommand.ts"
import { OnOffState } from "./OnOffState.ts"
import { PositionCommand } from "./PositionCommand.ts"
import { PositionState } from "./PositionState.ts"
import { PressState } from "./PressState.ts"
import { PressureState } from "./PressureState.ts"
import { RainState } from "./RainState.ts"
import { SetpointCommand } from "./SetpointCommand.ts"
import { SetpointState } from "./SetpointState.ts"
import { SmokeState } from "./SmokeState.ts"
import { TemperatureState } from "./TemperatureState.ts"
import { TunableWhiteCommand } from "./TunableWhiteCommand.ts"
import { TunableWhiteState } from "./TunableWhiteState.ts"

/** The sensor for each kind of command and the actuator for each kind of state. */
export class Capabilities {
  static readonly sensorFor = {
    onOff: OnOffCommand, brightness: BrightnessCommand, colorTemperature: ColorTemperatureCommand, tunableWhite: TunableWhiteCommand,
    position: PositionCommand, setpoint: SetpointCommand, fanSpeed: FanSpeedCommand, lock: LockCommand
  } as const satisfies Record<CommandKind, unknown>

  static readonly actuatorFor = {
    onOff: OnOffState, brightness: BrightnessState, colorTemperature: ColorTemperatureState, tunableWhite: TunableWhiteState,
    position: PositionState, setpoint: SetpointState, fanSpeed: FanSpeedState, temperature: TemperatureState,
    humidity: HumidityState, contact: ContactState, occupancy: OccupancyState, locked: LockedState, smoke: SmokeState,
    co: CoState, leak: LeakState, press: PressState, longPress: LongPressState, illuminance: IlluminanceState,
    pressure: PressureState, flow: FlowState, rain: RainState, freeze: FreezeState, battery: BatteryState
  } as const satisfies Record<StateKind, unknown>

  static readonly sensors = Object.values(Capabilities.sensorFor)
  static readonly actuators = Object.values(Capabilities.actuatorFor)
}
