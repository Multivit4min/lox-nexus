import type { CommandKind, StateKind } from "../devices/DeviceKinds.ts"
import { AirQualityState } from "./AirQualityState.ts"
import { BatteryState } from "./BatteryState.ts"
import { BrightnessCommand } from "./BrightnessCommand.ts"
import { BrightnessState } from "./BrightnessState.ts"
import { ChargingEnabledCommand } from "./ChargingEnabledCommand.ts"
import { ChargingEnabledState } from "./ChargingEnabledState.ts"
import { ChargingModeCommand } from "./ChargingModeCommand.ts"
import { ChargingModeState } from "./ChargingModeState.ts"
import { ChargingState } from "./ChargingState.ts"
import { Co2State } from "./Co2State.ts"
import { CoState } from "./CoState.ts"
import { ColorCommand } from "./ColorCommand.ts"
import { ColorState } from "./ColorState.ts"
import { ColorTemperatureCommand } from "./ColorTemperatureCommand.ts"
import { ColorTemperatureState } from "./ColorTemperatureState.ts"
import { ContactState } from "./ContactState.ts"
import { CoolingSetpointCommand } from "./CoolingSetpointCommand.ts"
import { CoolingSetpointState } from "./CoolingSetpointState.ts"
import { CurrentState } from "./CurrentState.ts"
import { EnergyExportedState } from "./EnergyExportedState.ts"
import { EnergyImportedState } from "./EnergyImportedState.ts"
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
import { MaxCurrentCommand } from "./MaxCurrentCommand.ts"
import { MaxCurrentState } from "./MaxCurrentState.ts"
import { ModeCommand } from "./ModeCommand.ts"
import { ModeState } from "./ModeState.ts"
import { OccupancyState } from "./OccupancyState.ts"
import { OnOffCommand } from "./OnOffCommand.ts"
import { OnOffState } from "./OnOffState.ts"
import { PluggedInState } from "./PluggedInState.ts"
import { Pm25State } from "./Pm25State.ts"
import { PositionCommand } from "./PositionCommand.ts"
import { PositionState } from "./PositionState.ts"
import { PowerState } from "./PowerState.ts"
import { PressState } from "./PressState.ts"
import { PressureState } from "./PressureState.ts"
import { ProductionState } from "./ProductionState.ts"
import { RainState } from "./RainState.ts"
import { SessionEnergyState } from "./SessionEnergyState.ts"
import { SetpointCommand } from "./SetpointCommand.ts"
import { SetpointState } from "./SetpointState.ts"
import { SmokeState } from "./SmokeState.ts"
import { TemperatureState } from "./TemperatureState.ts"
import { TiltCommand } from "./TiltCommand.ts"
import { TiltState } from "./TiltState.ts"
import { TunableWhiteCommand } from "./TunableWhiteCommand.ts"
import { TunableWhiteState } from "./TunableWhiteState.ts"
import { ValveCommand } from "./ValveCommand.ts"
import { ValveState } from "./ValveState.ts"
import { VoltageState } from "./VoltageState.ts"

/** The sensor for each kind of command and the actuator for each kind of state. */
export class Capabilities {
  static readonly sensorFor = {
    onOff: OnOffCommand, brightness: BrightnessCommand, colorTemperature: ColorTemperatureCommand, tunableWhite: TunableWhiteCommand,
    position: PositionCommand, setpoint: SetpointCommand, fanSpeed: FanSpeedCommand, lock: LockCommand, tilt: TiltCommand,
    color: ColorCommand, coolingSetpoint: CoolingSetpointCommand, mode: ModeCommand, valve: ValveCommand,
    chargingEnabled: ChargingEnabledCommand, maxCurrent: MaxCurrentCommand, chargingMode: ChargingModeCommand
  } as const satisfies Record<CommandKind, unknown>

  static readonly actuatorFor = {
    onOff: OnOffState, brightness: BrightnessState, colorTemperature: ColorTemperatureState, tunableWhite: TunableWhiteState,
    position: PositionState, setpoint: SetpointState, fanSpeed: FanSpeedState, temperature: TemperatureState,
    humidity: HumidityState, contact: ContactState, occupancy: OccupancyState, locked: LockedState, smoke: SmokeState,
    co: CoState, leak: LeakState, press: PressState, longPress: LongPressState, illuminance: IlluminanceState,
    pressure: PressureState, flow: FlowState, rain: RainState, freeze: FreezeState, battery: BatteryState, tilt: TiltState,
    color: ColorState, coolingSetpoint: CoolingSetpointState, mode: ModeState, valve: ValveState, airQuality: AirQualityState,
    co2: Co2State, pm25: Pm25State, power: PowerState, production: ProductionState, energyImported: EnergyImportedState,
    energyExported: EnergyExportedState, voltage: VoltageState, current: CurrentState, pluggedIn: PluggedInState,
    charging: ChargingState, chargingEnabled: ChargingEnabledState, maxCurrent: MaxCurrentState, sessionEnergy: SessionEnergyState,
    chargingMode: ChargingModeState
  } as const satisfies Record<StateKind, unknown>

  static readonly sensors = Object.values(Capabilities.sensorFor)
  static readonly actuators = Object.values(Capabilities.actuatorFor)
}
