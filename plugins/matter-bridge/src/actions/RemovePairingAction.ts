import { Action, z } from "@lox-nexus/plugin-sdk"
import type { MatterBridgePlugin } from "../MatterBridgePlugin.ts"

const input = z.object({
  fabricIndex: z.number().int().min(1).max(254).meta({
    title: "Fabric index",
    description: "The controller's fabric index, as the Controllers table shows it"
  })
})

/**
 * Removes one paired controller (fabric). Its app loses the bridge's devices; removing the last
 * one resets the bridge, which then waits to be paired again.
 */
export class RemovePairingAction extends Action<MatterBridgePlugin, z.infer<typeof input>> {
  static readonly id = "remove-pairing"
  static readonly label = "Remove pairing"
  /** a button on each row of the Controllers table */
  static readonly placement = "panel"
  static readonly description = "The controller loses the bridge and all its devices. Removing the last one resets the bridge for a new pairing"
  static readonly input = input
  static readonly confirm = "Remove this controller? Its app loses all devices of this bridge, and its routines with them stop working."

  async run() {
    const removed = await this.plugin.bridge.removeController(this.input.fabricIndex)
    const left = this.plugin.bridge.controllers().filter(controller => controller.fabricIndex !== this.input.fabricIndex).length
    return left === 0
      ? `Removed ${removed}. No controller is left: the bridge resets and waits to be paired again`
      : `Removed ${removed}. Its app no longer reaches the bridge's devices`
  }
}
