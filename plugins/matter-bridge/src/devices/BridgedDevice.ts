import type { Endpoint, MutableEndpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DeviceTypes, type DeviceTypeInfo } from "../config/DeviceTypes.ts"
import { BatteryServer } from "./BatteryServer.ts"
import { DeviceIdentity } from "./DeviceIdentity.ts"
import type { CommandKind, KindValue, StateKind } from "./DeviceKinds.ts"
import type { DeviceMemory } from "./DeviceMemory.ts"
import type { DeviceRecord } from "./DeviceRecord.ts"

/** what a device needs from the plugin */
export interface DeviceContext {
  now(): number
  /** resolves after `ms` on the plugin's clock (a long press holds the button), or when the plugin stops */
  wait(ms: number): Promise<void>
  /** a warning in the instance log */
  warn(message: string): void
  readonly memory: DeviceMemory
}

/** a command or state as the panel shows it */
export interface Recorded<K> { kind: K; value: KindValue; at: number }

type CommandListener = (value: KindValue) => void

/** a matter.js change event */
interface Listenable<T extends unknown[]> {
  on(listener: (...args: T) => void): void
  off(listener: (...args: T) => void): void
}

/** who made an attribute change: matter.js passes the action context with every change event */
type ChangeContext = { fabric?: unknown } | undefined

/**
 * One device as a bridged Matter endpoint. Commands from controllers update the attribute
 * (matter.js does that) and go to the command listeners; states from Nexus are set on the
 * attribute without coming back as commands.
 */
export abstract class BridgedDevice {
  readonly identity: DeviceIdentity
  readonly info: DeviceTypeInfo
  lastCommand: Recorded<CommandKind> | undefined
  lastState: Recorded<StateKind> | undefined
  abstract readonly endpoint: Endpoint
  private readonly listeners = new Map<CommandKind, Set<CommandListener>>()
  private readonly unwatch: (() => void)[] = []
  /** the last value Nexus sent per state, oldest first, to set again after a factory reset */
  private readonly states = new Map<StateKind, KindValue>()
  /** per kind, the controller action that sent the last command, to pass on each command of one action once */
  private readonly lastActions = new Map<CommandKind, { action: unknown; value: KindValue }>()

  /** whether the endpoint is part of the running node, so attributes can be set */
  attached = false
  private readonly record: DeviceRecord

  constructor(record: DeviceRecord, protected readonly context: DeviceContext) {
    this.record = { ...record }
    this.identity = new DeviceIdentity(record.seed ?? record.id)
    this.info = DeviceTypes.info(record.type, record.battery)
    for (const kind of this.info.states) {
      const value = this.remembered(kind)
      if (value !== undefined) this.states.set(kind, value)
    }
  }

  get id() {
    return this.record.id
  }

  get name() {
    return this.record.name
  }

  get type() {
    return this.record.type
  }

  /** door locks: whether controllers may unlock */
  get allowUnlock() {
    return this.record.allowUnlock
  }

  /** whether the device reports a battery level */
  get battery() {
    return this.info.states.includes("battery")
  }

  /** what the store keeps of this device */
  toRecord(): DeviceRecord {
    return { ...this.record }
  }

  /**
   * Renames (the apps get the new label) or changes a lock's unlocking; the identity stays. The
   * endpoint changes first: if it refuses, the device keeps what it had.
   */
  async update(changes: Partial<Pick<DeviceRecord, "name" | "allowUnlock">>) {
    const next = { ...this.record, ...changes }
    if (this.attached) await this.sync(next)
    Object.assign(this.record, changes)
  }

  /**
   * Brings the endpoint's settings in line with the record. matter.js restores what it stored,
   * such as the label before a rename, over what the endpoint was created with, and a factory
   * reset puts back what it was created with.
   */
  async sync(record: DeviceRecord = this.record) {
    if (this.endpoint.stateOf(BridgedDeviceBasicInformationServer).nodeLabel !== record.name) {
      await this.endpoint.setStateOf(BridgedDeviceBasicInformationServer, { nodeLabel: record.name })
    }
    // matter.js doesn't persist the battery level; it starts with what Nexus sent last
    const battery = this.battery ? this.remembered("battery") : undefined
    if (battery !== undefined) await this.applyState("battery", battery)
  }

  /** the endpoint type, with the battery's power source for a device that has one */
  protected withBattery<T extends MutableEndpoint>(type: T): T {
    return (this.battery ? type.with(BatteryServer) : type) as T
  }

  /** the bridged basic information the endpoint starts with */
  protected basicInformation() {
    return this.identity.basicInformation(this.name, this.info.label)
  }

  /** subscribes to one kind of command; returns the unsubscribe */
  onCommand(kind: CommandKind, listener: CommandListener) {
    let listeners = this.listeners.get(kind)
    if (!listeners) this.listeners.set(kind, listeners = new Set())
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /** sets an attribute from a state Nexus sent */
  async setState(kind: StateKind, value: KindValue) {
    if (!this.info.states.includes(kind)) throw new Error(`a ${this.info.label.toLowerCase()} has no ${kind} state`)
    await this.applyState(kind, value)
    this.lastState = { kind, value, at: this.context.now() }
    this.states.delete(kind)
    this.states.set(kind, value)
    this.context.memory.remember(this.identity.endpointId, kind, value)
  }

  /**
   * Sets every state Nexus sent again, in the order it sent them (a brightness before a later
   * "off" stays off). For the factory reset after the last controller is removed, which puts all
   * attributes back to their defaults.
   */
  async restore() {
    for (const [kind, value] of this.states) await this.applyState(kind, value)
  }

  /** the battery level is the same on every type; the rest is the type's own */
  private async applyState(kind: StateKind, value: KindValue) {
    if (kind === "battery") await this.endpoint.setStateOf(BatteryServer, BatteryServer.level(BridgedDevice.number(value)))
    else await this.apply(kind, value)
  }

  /**
   * After the factory reset that follows removing the last controller: the endpoint is as it was
   * created (old label, a lock's unlocking as at start), so the record's settings go first, then
   * the states Nexus sent.
   */
  async reconnect() {
    await this.sync()
    await this.restore()
  }

  /**
   * (Re)subscribes to the endpoint's changes. Called whenever the node comes online: the factory
   * reset after the last controller is removed rebuilds the endpoints' events.
   */
  watch() {
    for (const off of this.unwatch.splice(0)) off()
    this.subscribe()
  }

  /** subscribes to the attribute changes that are commands; sensors-only devices have none */
  protected subscribe() {}

  /** listens to a change event until the next watch() */
  protected listen<T extends unknown[]>(event: Listenable<T>, listener: (...args: T) => void) {
    event.on(listener)
    this.unwatch.push(() => event.off(listener))
  }

  protected abstract apply(kind: StateKind, value: KindValue): Promise<void>

  /**
   * A command from a controller: recorded for the panel and passed to the sensors. One controller
   * action can change several attributes (on and level, a stop's target): the same command from the
   * same action is passed on once.
   */
  protected command(kind: CommandKind, value: KindValue, action?: unknown) {
    const last = this.lastActions.get(kind)
    if (action !== undefined && last?.action === action && JSON.stringify(last.value) === JSON.stringify(value)) return
    this.lastActions.set(kind, { action, value })
    this.lastCommand = { kind, value, at: this.context.now() }
    for (const listener of this.listeners.get(kind) ?? []) listener(value)
  }

  /** whether a change came from a controller; sets from Nexus run without a fabric */
  protected static fromController(context: ChangeContext) {
    return context?.fabric !== undefined
  }

  /** the state Nexus sent last time, for attributes matter.js doesn't persist */
  protected remembered(kind: StateKind) {
    return this.context.memory.get(this.identity.endpointId, kind)
  }

  protected static number(value: KindValue) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`not a number: ${String(value)}`)
    return value
  }

  protected static clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
  }
}
