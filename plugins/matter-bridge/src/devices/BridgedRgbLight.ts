import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { ColorControlServer } from "@matter/main/behaviors/color-control"
import { ColorControl } from "@matter/main/clusters/color-control"
import { ExtendedColorLightDevice } from "@matter/main/devices/extended-color-light"
import { BridgedDevice } from "./BridgedDevice.ts"
import { BridgedDimmer } from "./BridgedDimmer.ts"
import { ColorTemperature } from "./ColorTemperature.ts"
import type { ColorValue, KindValue, StateKind } from "./DeviceKinds.ts"
import { RgbColor } from "./RgbColor.ts"

const RgbEndpoint = ExtendedColorLightDevice.with(BridgedDeviceBasicInformationServer, ColorControlServer.with("HueSaturation", "Xy", "ColorTemperature"))
const { ColorMode, EnhancedColorMode } = ColorControl
type Changed = "onOff" | "colorTemperature" | "color"

/**
 * A colour light (Matter's extended colour light): on/off, brightness, a colour temperature and a
 * colour. The colour goes both ways as red, green and blue in % with the brightness included, so it
 * drives a Loxone RGBW actuator as it is; an app's white (a colour temperature) comes as its RGB too,
 * and as the colour temperature. Brightness works as on a dimmable light: 0 % while off.
 */
export class BridgedRgbLight extends BridgedDevice {
  readonly endpoint = new Endpoint(RgbEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    onOff: { onOff: false },
    levelControl: { currentLevel: BridgedDimmer.MAX_LEVEL },
    colorControl: {
      colorMode: ColorMode.ColorTemperatureMireds,
      enhancedColorMode: EnhancedColorMode.ColorTemperatureMireds,
      currentHue: 0,
      currentSaturation: 0,
      // D65 white
      currentX: 20493,
      currentY: 21561,
      colorTemperatureMireds: ColorTemperature.mireds(4000),
      colorTempPhysicalMinMireds: ColorTemperature.MIN_MIREDS,
      colorTempPhysicalMaxMireds: ColorTemperature.MAX_MIREDS,
      coupleColorTempToLevelMinMireds: ColorTemperature.MIN_MIREDS,
      remainingTime: 0
    }
  })

  /** what a controller changed since the light last reported, sent together once things settle */
  private pending: Set<Changed> | undefined

  protected override subscribe() {
    const { onOff, levelControl, colorControl } = this.endpoint.events
    this.listen(onOff.onOff$Changed, (_on, _old, context) => this.changed(context, "onOff"))
    this.listen(levelControl.currentLevel$Changed, (_level, _old, context) => this.changed(context))
    this.listen(colorControl.colorTemperatureMireds$Changed, (_mireds, _old, context) => this.changed(context, "colorTemperature"))
    for (const event of [colorControl.currentHue$Changed, colorControl.currentSaturation$Changed, colorControl.currentX$Changed, colorControl.currentY$Changed]) {
      this.listen(event, (_value: unknown, _old: unknown, context: { fabric?: unknown } | undefined) => this.changed(context, "color"))
    }
  }

  protected async apply(kind: StateKind, value: KindValue) {
    if (kind === "onOff") return this.endpoint.set({ onOff: { onOff: value === true } })
    if (kind === "colorTemperature") {
      const mireds = ColorTemperature.mireds(BridgedDevice.number(value))
      return this.endpoint.set({ colorControl: { colorMode: ColorMode.ColorTemperatureMireds, enhancedColorMode: EnhancedColorMode.ColorTemperatureMireds, colorTemperatureMireds: mireds } })
    }
    if (kind === "color") return this.setColor(BridgedRgbLight.color(value))
    await this.setBrightness(BridgedDevice.number(value))
  }

  private async setColor(color: ColorValue) {
    const { currentHue, currentSaturation, brightness } = RgbColor.toHueSaturation(color)
    const mode = { colorMode: ColorMode.CurrentHueAndCurrentSaturation, enhancedColorMode: EnhancedColorMode.CurrentHueAndCurrentSaturation }
    await this.endpoint.set({ colorControl: { ...mode, currentHue, currentSaturation } })
    await this.setBrightness(brightness)
  }

  private async setBrightness(percent: number) {
    if (percent <= 0) return this.endpoint.set({ onOff: { onOff: false } })
    await this.endpoint.set({ onOff: { onOff: true }, levelControl: { currentLevel: BridgedDimmer.level(percent) } })
  }

  /** one controller action changes several attributes: the light reports once, as it ends up, after this turn */
  private changed(context: { fabric?: unknown } | undefined, kind?: Changed) {
    if (!BridgedDevice.fromController(context)) return
    const flush = !this.pending
    this.pending ??= new Set()
    if (kind) this.pending.add(kind)
    if (flush) void this.context.wait(0).then(() => this.report())
  }

  private report() {
    const changed = this.pending ?? new Set()
    this.pending = undefined
    const { onOff, levelControl, colorControl } = this.endpoint.state
    const brightness = onOff.onOff ? BridgedDimmer.percent(levelControl.currentLevel ?? BridgedDimmer.MAX_LEVEL) : 0
    const action = {}
    if (changed.has("onOff")) this.command("onOff", onOff.onOff, action)
    if (changed.has("colorTemperature") && colorControl.colorMode === ColorMode.ColorTemperatureMireds) {
      this.command("colorTemperature", ColorTemperature.kelvin(colorControl.colorTemperatureMireds), action)
    }
    this.command("brightness", brightness, action)
    this.command("color", RgbColor.of(colorControl, brightness), action)
  }

  private static color(value: KindValue): ColorValue {
    if (typeof value !== "object" || !("red" in value)) throw new Error(`not a colour: ${JSON.stringify(value)}`)
    return value
  }
}
