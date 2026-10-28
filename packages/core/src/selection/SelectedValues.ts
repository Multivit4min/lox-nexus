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
    if (this.selection().includes(signal)) this.handler(signal, { ...message, value: message.value })
    else this.excluded(signal)
  }
}
