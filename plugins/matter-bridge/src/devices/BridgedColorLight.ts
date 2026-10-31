import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ColorControlServer } from "@matter/main/behaviors/color-control"
import { ColorControl } from "@matter/main/clusters/color-control"
import { ColorTemperatureLightDevice } from "@matter/main/devices/color-temperature-light"
import { BridgedDevice } from "./BridgedDevice.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { ColorTemperature } from "./ColorTemperature.ts"
import type { KindValue, StateKind, TunableWhiteValue } from "./DeviceKinds.ts"
import { SettledReport } from "./SettledReport.ts"

const ColorLightEndpoint = ColorTemperatureLightDevice.with(BridgedDeviceBasicInformationServer, ColorControlServer.with("ColorTemperature"))
const { ColorMode, EnhancedColorMode } = ColorControl

/**
 * A tunable white light: on/off, brightness and colour temperature, each on its own and together
 * as a tunable white value (a Loxone smart tunable-white actuator takes it as it is). Brightness
 * works as on a dimmable light: 0 % while off.
 */
export class BridgedColorLight extends BridgedDevice {
  readonly endpoint = new Endpoint(ColorLightEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    onOff: { onOff: false },
    levelControl: { currentLevel: BridgedDimmer.MAX_LEVEL },
    colorControl: {
      colorMode: ColorMode.ColorTemperatureMireds,
      enhancedColorMode: EnhancedColorMode.ColorTemperatureMireds,
      colorTemperatureMireds: ColorTemperature.mireds(4000),
      colorTempPhysicalMinMireds: ColorTemperature.MIN_MIREDS,
      colorTempPhysicalMaxMireds: ColorTemperature.MAX_MIREDS,
      coupleColorTempToLevelMinMireds: ColorTemperature.MIN_MIREDS,
      remainingTime: 0
    }
  })

  /** what a controller changed since the light last reported, sent together once things settle */
  private readonly reports = new SettledReport<"onOff" | "colorTemperature">(() => this.context.wait(0), changed => this.report(changed), message => this.context.warn(message))

  protected override subscribe() {
    const events = this.endpoint.events
    this.listen(events.onOff.onOff$Changed, (_on, _old, context) => this.changed(context, "onOff"))
    this.listen(events.levelControl.currentLevel$Changed, (_level, _old, context) => this.changed(context))
    this.listen(events.colorControl.colorTemperatureMireds$Changed, (_mireds, _old, context) => this.changed(context, "colorTemperature"))
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (kind === "onOff") return this.endpoint.set({ onOff: { onOff: value === true } })
    if (kind === "colorTemperature") return this.setKelvin(BridgedDevice.number(value))
    const white = kind === "tunableWhite" ? BridgedColorLight.white(value) : undefined
    const percent = white ? white.brightness : BridgedDevice.number(value)
    if (white) await this.setKelvin(white.temperature)
    if (percent <= 0) return this.endpoint.set({ onOff: { onOff: false } })
    await this.endpoint.set({ onOff: { onOff: true }, levelControl: { currentLevel: BridgedDimmer.level(percent) } })
  }

  /** one controller action changes several attributes: the light reports once, as it ends up */
  private changed(context: { fabric?: unknown } | undefined, kind?: "onOff" | "colorTemperature") {
    if (BridgedDevice.fromController(context)) this.reports.changed(kind)
  }

  private report(changed: ReadonlySet<"onOff" | "colorTemperature">) {
    const { onOff, levelControl, colorControl } = this.endpoint.state
    const brightness = onOff.onOff ? BridgedDimmer.percent(levelControl.currentLevel ?? BridgedDimmer.MAX_LEVEL) : 0
    const temperature = ColorTemperature.kelvin(colorControl.colorTemperatureMireds)
    const action = {}
    if (changed.has("onOff")) this.command("onOff", onOff.onOff, action)
    if (changed.has("colorTemperature")) this.command("colorTemperature", temperature, action)
    this.command("brightness", brightness, action)
    this.command("tunableWhite", { temperature, brightness }, action)
  }

  private async setKelvin(kelvin: number) {
    await this.endpoint.set({ colorControl: { colorTemperatureMireds: ColorTemperature.mireds(kelvin) } })
  }

  private static white(value: KindValue): TunableWhiteValue {
    if (typeof value !== "object" || !("temperature" in value)) throw new Error(`not a tunable white value: ${JSON.stringify(value)}`)
    return value
  }
}
