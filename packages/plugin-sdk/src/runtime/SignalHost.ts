import { z } from "zod"
import type { Actuator } from "../plugin/Actuator.ts"
import type { Plugin, PluginClass } from "../plugin/Plugin.ts"
import type { Sensor } from "../plugin/Sensor.ts"
import { Converter } from "../values/Converter.ts"
import type { Value, ValueType } from "../values/Value.ts"
import type { SignalSpec } from "../wire/HostMessages.ts"
import type { WorkerMessage } from "../wire/WorkerMessages.ts"
import { ActuatorRunner } from "./ActuatorRunner.ts"
import { CauseScope } from "./CauseScope.ts"
import { Declarations } from "./Declarations.ts"
import { MessageLimits } from "./MessageLimits.ts"
import { SignalStatus } from "./SignalStatus.ts"

type Entry =
  | { kind: "sensor"; instance: Sensor<Plugin, unknown> }
  | { kind: "actuator"; instance: Actuator<Plugin, unknown, Value>; runner: ActuatorRunner; accepts: ValueType | "any" }

/** The configured sensors and actuators of a running plugin, created from the host's signal specs. */
export class SignalHost {
  private readonly entries = new Map<string, Entry>()

  constructor(
    private readonly type: PluginClass,
    private readonly plugin: Plugin,
    private readonly send: (message: WorkerMessage) => void
  ) {}

  /**
   * Validates the params, constructs the sensor or actuator and starts it.
   * @throws Error for a duplicate id, an unknown capability or invalid params (readable message), or whatever start() throws
   */
  async add(spec: SignalSpec) {
    if (this.entries.has(spec.id)) throw new Error(`signal "${spec.id}" already exists`)
    const entry = spec.kind === "sensor" ? this.sensor(spec) : this.actuator(spec)
    this.entries.set(spec.id, entry)
    try {
      await entry.instance.start()
    } catch (error) {
      this.entries.delete(spec.id)
      await entry.instance.dispose().catch(() => undefined)
      throw error
    }
  }

  /** disposes the signal; unknown ids are ignored. Commands still waiting for an actuator are rejected. */
  async remove(id: string) {
    const entry = this.entries.get(id)
    this.entries.delete(id)
    if (entry?.kind === "actuator") entry.runner.close()
    await entry?.instance.dispose()
  }

  /**
   * Runs an actuator with the value converted to what it accepts.
   * @throws Error when the id is not an actuator; whatever run() throws, or SupersededError
   */
  actuate(id: string, value: Value, causeId: string | undefined, replayed = false): Promise<void> {
    const entry = this.entries.get(id)
    if (entry?.kind !== "actuator") return Promise.reject(new Error(`"${id}" is not an actuator of this plugin`))
    const converted = entry.accepts === "any" ? value : Converter.convert(value, entry.accepts)
    return entry.runner.submit(converted, causeId, replayed)
  }

  /** disposes every signal, collecting errors instead of stopping at the first */
  async disposeAll() {
    const all = [...this.entries.values()]
    this.entries.clear()
    for (const entry of all) if (entry.kind === "actuator") entry.runner.close()
    await Promise.allSettled(all.map(entry => entry.instance.dispose()))
  }

  private sensor(spec: SignalSpec): Entry {
    const type = Declarations.sensors(this.type).find(candidate => candidate.id === spec.capability)
    if (!type) throw new Error(`${this.type.name} has no sensor "${spec.capability}"`)
    const params = SignalHost.parse(Declarations.params(type), spec.params)
    const output = {
      emit: (value: Value) => this.send({ type: "emit", signalId: spec.id, value, ...SignalHost.cause() }),
      fail: (message: string) => this.send({ type: "signal.error", signalId: spec.id, error: MessageLimits.clip(message) }),
      recover: () => this.send({ type: "signal.recovered", signalId: spec.id })
    }
    return { kind: "sensor", instance: new type(this.plugin as never, params as never, output, SignalHost.info(spec)) }
  }

  private actuator(spec: SignalSpec): Entry {
    const type = Declarations.actuators(this.type).find(candidate => candidate.id === spec.capability)
    if (!type) throw new Error(`${this.type.name} has no actuator "${spec.capability}"`)
    const instance = new type(this.plugin as never, SignalHost.parse(Declarations.params(type), spec.params) as never, SignalHost.info(spec)) as unknown as Actuator<Plugin, unknown, Value>
    SignalStatus.attach(instance, {
      fail: message => this.send({ type: "signal.error", signalId: spec.id, error: MessageLimits.clip(message) }),
      recover: () => this.send({ type: "signal.recovered", signalId: spec.id })
    })
    return { kind: "actuator", instance, runner: new ActuatorRunner(instance, Declarations.concurrency(type)), accepts: Declarations.accepts(type) }
  }

  private static info(spec: SignalSpec) {
    return { id: spec.id, label: spec.label ?? "" }
  }

  private static cause() {
    const causeId = CauseScope.current()
    return causeId === undefined ? {} : { causeId }
  }

  /** @throws Error with zod's readable summary */
  private static parse(schema: z.ZodType, params: unknown) {
    const result = schema.safeParse(params)
    if (!result.success) throw new Error(`invalid params: ${z.prettifyError(result.error)}`)
    return result.data
  }
}
