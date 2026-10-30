import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ThermostatServer } from "@matter/main/behaviors/thermostat"
import { Thermostat } from "@matter/main/clusters/thermostat"
import { ThermostatDevice } from "@matter/main/devices/thermostat"
import { BridgedDevice } from "./BridgedDevice.ts"
import { BridgedTemperature } from "./BridgedTemperature.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const ThermostatEndpoint = ThermostatDevice.with(BridgedDeviceBasicInformationServer, ThermostatServer.with("Heating"))

/**
 * A heating thermostat: the room temperature and the heating setpoint from Nexus, setpoint changes
 * from controllers. Always in heat mode; the temperature is unknown until Nexus sends one.
 */
export class BridgedThermostat extends BridgedDevice {
  readonly endpoint = new Endpoint(ThermostatEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.identity.basicInformation(this.name),
    thermostat: {
      controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
      systemMode: Thermostat.SystemMode.Heat,
      // what Nexus sent before the restart, else unknown
      localTemperature: BridgedTemperature.hundredths(this.remembered("temperature"))
    }
  })

  protected override subscribe() {
    this.listen(this.endpoint.events.thermostat.occupiedHeatingSetpoint$Changed, (setpoint, _old, context) => {
      if (BridgedDevice.fromController(context)) this.command("setpoint", setpoint / 100)
    })
  }

  protected async apply(kind: StateKind, value: KindValue) {
    const hundredths = Math.round(BridgedDevice.number(value) * 100)
    if (kind === "temperature") return this.endpoint.set({ thermostat: { localTemperature: BridgedTemperature.hundredths(BridgedDevice.number(value)) } })
    // Matter refuses a setpoint outside the limits; the closest allowed one is shown instead
    const { minHeatSetpointLimit, maxHeatSetpointLimit, absMinHeatSetpointLimit, absMaxHeatSetpointLimit } = this.endpoint.state.thermostat
    const min = minHeatSetpointLimit ?? absMinHeatSetpointLimit ?? 700
    const max = maxHeatSetpointLimit ?? absMaxHeatSetpointLimit ?? 3000
    await this.endpoint.set({ thermostat: { occupiedHeatingSetpoint: BridgedDevice.clamp(hundredths, min, max) } })
  }
}
