/** Where an actuator's fail() and recover() go; the runtime attaches it after construction. */
export interface SignalStatusOutput {
  fail(message: string): void
  recover(): void
}

/**
 * Connects actuators to the host's signal status without a constructor parameter, so actuator
 * subclasses with their own constructor keep working. Kept out of the public API: plugins only
 * call `fail()` and `recover()` on their actuator.
 */
export class SignalStatus {
  private static readonly outputs = new WeakMap<object, SignalStatusOutput>()

  static attach(signal: object, output: SignalStatusOutput) {
    SignalStatus.outputs.set(signal, output)
  }

  /** undefined for an actuator built outside the runtime, e.g. directly in a unit test */
  static of(signal: object) {
    return SignalStatus.outputs.get(signal)
  }
}
