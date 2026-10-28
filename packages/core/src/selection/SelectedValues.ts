import { Disposable } from "@lox-nexus/plugin-sdk"
import type { BusMessage } from "../bus/BusMessage.ts"
import type { EventBus } from "../bus/EventBus.ts"
import type { Signal } from "../wires/Signal.ts"
import type { SignalRegistry } from "../wires/SignalRegistry.ts"
import type { SignalSelection } from "./SignalSelection.ts"

/** A value of a selected signal: a state, or a command to an actuator. */
export type SelectedHandler = (signal: Signal, message: BusMessage & { value: NonNullable<BusMessage["value"]> }) => void

/**
 * Hands on the values of the signals a selection includes, as subscribers see them: forced values
 * instead of real ones, never shadowed publishes. Status topics, discovered packets and events are
 * not signals and never pass. The selection is asked per message, so a changed selection or a
 * new signal applies at once. `excluded` hears about values of signals the selection leaves out,
 * e.g. so a consumer can close what it kept of a signal that is no longer selected.
 */
export class SelectedValues extends Disposable {
  /** signals whose last value passed on was forced */
  private readonly forced = new Set<string>()

  constructor(
    bus: Pick<EventBus, "subscribe">,
    private readonly signals: Pick<SignalRegistry, "atTopic">,
    private readonly selection: () => SignalSelection,
    private readonly handler: SelectedHandler,
    private readonly excluded: (signal: Signal) => void = () => {}
  ) {
    super()
    this.own(bus.subscribe("#", message => this.receive(message)))
  }

  private receive(message: BusMessage) {
    if ((message.kind !== "state" && message.kind !== "command") || !message.value) return
    const signal = this.signals.atTopic(message.topic)
    if (!signal) return
    if (!this.selection().includes(signal)) return this.excluded(signal)
    this.handler(signal, { ...this.afterForce(signal.id, message), value: message.value })
  }

  // Releasing a force sends the real value again, still flagged `restored` when it came from the
  // boot snapshot. Consumers skip restored values as replays, but after a forced one it is the
  // change back to the real value, so it passes without the flag.
  private afterForce(signalId: string, message: BusMessage): BusMessage {
    if (message.flags?.forced) {
      this.forced.add(signalId)
      return message
    }
    if (!this.forced.delete(signalId) || !message.flags?.restored) return message
    const flags = { ...message.flags }
    delete flags.restored
    return { ...message, flags }
  }
}
