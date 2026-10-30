import type { Endpoint } from "@matter/main"
import type { DeviceConfig } from "../config/BridgeConfig.ts"
import { DeviceTypes, type DeviceTypeInfo } from "../config/DeviceTypes.ts"
import { DeviceIdentity } from "./DeviceIdentity.ts"
import type { CommandKind, KindValue, StateKind } from "./DeviceKinds.ts"
import type { DeviceMemory } from "./DeviceMemory.ts"

/** what a device needs from the plugin */
export interface DeviceContext {
  now(): number
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
 * One configured device as a bridged Matter endpoint. Commands from controllers update the
 * attribute (matter.js does that) and go to the command listeners; states from Nexus are set on
 * the attribute without coming back as commands.
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
  /** the controller action that sent the last command, to pass on each command of one action once */
  private lastAction: { action: unknown; kind: CommandKind; value: KindValue } | undefined

  constructor(readonly config: DeviceConfig, protected readonly context: DeviceContext) {
    this.identity = new DeviceIdentity(config)
    this.info = DeviceTypes.info(config.type)
    for (const kind of this.info.states) {
      const value = this.remembered(kind)
      if (value !== undefined) this.states.set(kind, value)
    }
  }

  get name() {
    return this.config.name
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
    await this.apply(kind, value)
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
    for (const [kind, value] of this.states) await this.apply(kind, value)
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
    const last = this.lastAction
    if (action !== undefined && last?.action === action && last.kind === kind && last.value === value) return
    this.lastAction = { action, kind, value }
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
