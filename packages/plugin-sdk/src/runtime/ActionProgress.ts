/** Where an action's progress() goes; the runtime attaches it to the running action. */
export type ProgressSink = (text: string, fraction?: number) => void

/**
 * Connects a running action to the host's progress messages without a constructor parameter, so
 * action subclasses with their own constructor keep working. Kept out of the public API.
 */
export class ActionProgress {
  private static readonly sinks = new WeakMap<object, ProgressSink>()

  static attach(action: object, sink: ProgressSink) {
    ActionProgress.sinks.set(action, sink)
  }

  /** undefined for an action built outside the runtime or on a host that shows no progress */
  static of(action: object) {
    return ActionProgress.sinks.get(action)
  }
}
