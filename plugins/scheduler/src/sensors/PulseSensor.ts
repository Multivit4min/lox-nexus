import { duration, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import { TriggerParams } from "../params/TriggerParams.ts"
import { TriggerSensor } from "./TriggerSensor.ts"

const pulseParams = TriggerParams.schema({
  seconds: duration({ unit: "s", min: 0.1, max: 3600 }).default(1).meta({
    title: "Pulse length", description: "How long it stays true, 0.1 s to 1 hour"
  })
})

/**
 * True at each run, false again after the pulse length.
 *
 * A pulse never comes back as true: the sensor sends false as soon as it starts, so a true left
 * on the bus by a stop in the middle of a pulse (a sensor can't send anything while it is
 * disposed) is replaced at the next start, and a new run is a new pulse, not a value kept from
 * before. Only the grace for a run missed at most 5 minutes before the start sends a true then.
 */
export class PulseSensor extends TriggerSensor<z.output<typeof pulseParams>> {
  static readonly id = "pulse"
  static readonly label = "Pulse"
  static readonly description = "True for a moment at each run, e.g. to start a Loxone program at 06:30 on workdays"
  static readonly params = pulseParams
  static readonly valueType = "boolean"
  readonly kind = "Pulse"
  private cancelOff: (() => void) | undefined

  override start() {
    this.emit(Value.boolean(false))
    super.start()
  }

  protected fire() {
    // a run during a pulse makes it longer instead of sending true twice
    this.cancelOff?.()
    this.emit(Value.boolean(true))
    this.cancelOff = this.after(this.params.seconds * 1000, () => this.emit(Value.boolean(false)))
  }
}
