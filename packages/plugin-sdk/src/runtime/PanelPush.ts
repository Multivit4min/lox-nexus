/**
 * Connects a plugin's panelChanged() to the host's `panel.changed` message, at most once a second
 * (a change during that second is sent when it ends). Kept out of the public API; a plugin built
 * outside the runtime, or on a host without "panel.push", has none.
 */
export class PanelPush {
  private static readonly sinks = new WeakMap<object, () => void>()

  static attach(plugin: object, sink: () => void) {
    PanelPush.sinks.set(plugin, sink)
  }

  static of(plugin: object) {
    return PanelPush.sinks.get(plugin)
  }
}
