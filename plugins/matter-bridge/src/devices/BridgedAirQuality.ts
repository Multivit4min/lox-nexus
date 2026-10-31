import { Endpoint } from "@matter/main"
import { AirQualityServer } from "@matter/main/behaviors/air-quality"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { CarbonDioxideConcentrationMeasurementServer } from "@matter/main/behaviors/carbon-dioxide-concentration-measurement"
import { Pm25ConcentrationMeasurementServer } from "@matter/main/behaviors/pm25-concentration-measurement"
import { ConcentrationMeasurement } from "@matter/main/clusters/concentration-measurement"
import { AirQualitySensorDevice } from "@matter/main/devices/air-quality-sensor"
import { AirQualityLevel } from "./AirQualityLevel.ts"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue, StateKind } from "./DeviceKinds.ts"

const AirEndpoint = AirQualitySensorDevice.with(
  BridgedDeviceBasicInformationServer,
  AirQualityServer.with("Fair", "Moderate", "VeryPoor", "ExtremelyPoor"),
  CarbonDioxideConcentrationMeasurementServer.with("NumericMeasurement"),
  Pm25ConcentrationMeasurementServer.with("NumericMeasurement")
)
const { MeasurementUnit, MeasurementMedium } = ConcentrationMeasurement

/**
 * An air quality sensor: Matter's air quality level, CO₂ in ppm and PM2.5 in µg/m³, each unknown
 * until Nexus sends it. Without a level of its own from Nexus, the level follows the worse of the
 * CO₂ and PM2.5 readings (see AirQualityLevel); once Nexus sends a level, that one is shown.
 */
export class BridgedAirQuality extends BridgedDevice {
  readonly endpoint = new Endpoint(this.withBattery(AirEndpoint), {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    airQuality: { airQuality: this.initialLevel() },
    carbonDioxideConcentrationMeasurement: BridgedAirQuality.reading(this.remembered("co2"), MeasurementUnit.Ppm),
    pm25ConcentrationMeasurement: BridgedAirQuality.reading(this.remembered("pm25"), MeasurementUnit.Ugm3)
  })

  protected async apply(kind: StateKind, value: KindValue) {
    if (kind === "airQuality") return this.endpoint.set({ airQuality: { airQuality: AirQualityLevel.level(BridgedDevice.number(value)) } })
    const number = BridgedDevice.number(value)
    if (kind === "co2") await this.endpoint.set({ carbonDioxideConcentrationMeasurement: { measuredValue: Math.max(0, number) } })
    else await this.endpoint.set({ pm25ConcentrationMeasurement: { measuredValue: Math.max(0, number) } })
    if (this.remembered("airQuality") !== undefined) return
    const { carbonDioxideConcentrationMeasurement: co2, pm25ConcentrationMeasurement: pm25 } = this.endpoint.state
    await this.endpoint.set({ airQuality: { airQuality: AirQualityLevel.of(co2.measuredValue ?? undefined, pm25.measuredValue ?? undefined) } })
  }

  /** the level Nexus sent last, else the one the remembered readings stand for */
  private initialLevel() {
    const [level, co2, pm25] = (["airQuality", "co2", "pm25"] as const).map(kind => this.remembered(kind))
    if (typeof level === "number") return AirQualityLevel.level(level)
    return AirQualityLevel.of(typeof co2 === "number" ? co2 : undefined, typeof pm25 === "number" ? pm25 : undefined)
  }

  private static reading(value: KindValue | undefined, measurementUnit: ConcentrationMeasurement.MeasurementUnit) {
    const measuredValue = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null
    return { measuredValue, minMeasuredValue: null, maxMeasuredValue: null, measurementUnit, measurementMedium: MeasurementMedium.Air }
  }
}
