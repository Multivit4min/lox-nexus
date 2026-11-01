import { Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { SmartPlugPlugin } from "../SmartPlugPlugin.ts"

// the settings of one signal: which of the plug's readings it is
const params = z.object({
  reading: z.enum(["power", "energy"]).default("power").meta({
    title: "Reading",
    description: "Which of the plug's readings this signal is",
    // what the form shows instead of the raw values
    enumLabels: { power: "Power now (W)", energy: "Energy used so far (kWh)" }
  })
})

/** A number the plug measures. Sends it after every reading; the bus drops a value equal to the one before. */
export class MeterSensor extends Sensor<SmartPlugPlugin, z.infer<typeof params>> {
  static readonly id = "meter"
  static readonly label = "Meter"
  static readonly description = "What the plug draws now, or what it used so far"
  static readonly params = params
  static readonly valueType = "number"

  override start() {
    this.listen(this.plugin.readings, "reading", status => this.emit(Value.number(status[this.params.reading])))
    // a signal added while the plugin runs shouldn't wait for the next reading
    if (this.plugin.latest) this.emit(Value.number(this.plugin.latest[this.params.reading]))
  }
}
