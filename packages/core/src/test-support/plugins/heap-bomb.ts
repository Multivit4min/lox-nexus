import { Actuator, Plugin, PluginEntry } from "@lox-nexus/plugin-sdk"

/** allocates until the worker's heap limit kills it */
class BombActuator extends Actuator {
  static readonly id = "bomb"

  run() {
    const hoard: number[][] = []
    for (;;) hoard.push(new Array<number>(1_000_000).fill(1))
  }
}

class HeapBombPlugin extends Plugin {
  static readonly actuators = [BombActuator]
}

export default PluginEntry.define(HeapBombPlugin)
