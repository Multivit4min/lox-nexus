import { EventEmitter } from "node:events"
import { Actuator, Plugin, Sensor, z } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"

/** emits its start value, then whatever the "set" actuator receives */
class ValueSensor extends Sensor<CounterPlugin, { start: number }> {
  static readonly id = "value"
  static readonly params = z.object({ start: z.number() })
  static readonly valueType = "number"

  override start() {
    this.emit(Value.number(this.params.start))
    this.listen(this.plugin.values, "value", (n: number) => this.emit(Value.number(n)))
  }
}

class SetActuator extends Actuator<CounterPlugin, object, Extract<Value, { type: "number" }>> {
  static readonly id = "set"
  static readonly accepts = "number"

  run(value: Extract<Value, { type: "number" }>) {
    if (value.value < 0) throw new Error("negative")
    if (value.value === 13) this.plugin.status.set("degraded", "unlucky number")
    this.plugin.store.set("last", value.value)
    this.plugin.values.emit("value", value.value)
  }
}

/** The plugin the host tests run: a sensor and an actuator around one number. */
export class CounterPlugin extends Plugin<{ refuse: boolean; degraded: boolean }> {
  static readonly config = z.object({ refuse: z.boolean().default(false), degraded: z.boolean().default(false) })
  static readonly sensors = [ValueSensor]
  static readonly actuators = [SetActuator]
  readonly values = new EventEmitter()

  override start() {
    if (this.config.refuse) throw new Error("refused on purpose")
    if (this.config.degraded) this.status.set("degraded", "device unreachable")
    this.log.info("started")
    // a webhook: POST /value with a number as text sets the value like the actuator
    this.http.route("POST", "/value", request => {
      this.values.emit("value", Number(request.body))
      return { status: 202, body: "ok" }
    })
    // echoes what reached it, and tries what a hostile plugin would
    this.http.route("GET", "/echo", request => ({
      status: 200, body: JSON.stringify(request.headers),
      headers: { "content-type": "text/html", "set-cookie": "nexus=stolen", "content-security-policy": "default-src *", "x-plugin": "yes" }
    }))
    this.http.route("POST", "/fail", () => {
      throw new Error("handler blew up with internals")
    })
  }
}
