import { Actuator, Plugin, PluginEntry } from "@lox-nexus/plugin-sdk"

/** blocks the worker's thread forever, so it stops answering pings */
class SpinActuator extends Actuator {
  static readonly id = "spin"

  run() {
    for (;;) {
      // busy on purpose
    }
  }
}

class BusyPlugin extends Plugin {
  static readonly actuators = [SpinActuator]
}

export default PluginEntry.define(BusyPlugin)
