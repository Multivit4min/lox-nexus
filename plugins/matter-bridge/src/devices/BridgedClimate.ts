import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ThermostatDevice } from "@matter/main/devices/thermostat"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"
import { HeatCool, HeatCoolServer } from "./HeatCool.ts"

const ClimateEndpoint = ThermostatDevice.with(BridgedDeviceBasicInformationServer, HeatCoolServer)

/**
 * A thermostat that heats and cools (a heat pump or an air conditioner on Loxone's room
 * controller): the room temperature, the heating and cooling setpoints and the mode. Starts in
 * heat mode; the temperature is unknown until Nexus sends one.
 */
export class BridgedClimate extends BridgedDevice {
  readonly endpoint = new Endpoint(ClimateEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    thermostat: HeatCool.initial(this.remembered("temperature"))
  })

  private readonly thermostat = new HeatCool(this.endpoint)

  protected override subscribe() {
    this.thermostat.subscribe((event, listener) => this.listen(event, listener), (kind, value) => this.command(kind, value))
  }

  protected async apply(kind: StateKind, value: KindValue) {
    await this.thermostat.apply(kind, value)
  }
}
