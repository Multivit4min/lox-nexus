import { Value } from "@lox-nexus/plugin-sdk/values"
import type { Device, Statistics } from "../api/ApiSchemas.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { DeviceSensor, type Reading } from "./DeviceSensor.ts"

/**
 * One number from the device's latest statistics. Statistics are read only for devices with such
 * a signal, and only while the device is online.
 */
export abstract class DeviceStatisticSensor extends DeviceSensor {
  static readonly valueType = "number"
  /** what the number is, for messages */
  protected abstract readonly what: string

  override start() {
    this.onDispose(this.plugin.demand.need("statistics", this.mac))
    super.start()
    // the running poll didn't ask for this device's statistics yet; ask now rather than in a poll interval
    const poller = this.plugin.poller
    const device = poller.latest?.device(this.mac)
    if (device && poller.problem === undefined && !poller.latest?.extras.statistics.has(device.id)) void poller.poll()
  }

  protected read(device: Device, snapshot: NetworkSnapshot): Reading {
    if (device.state !== "ONLINE") return { problem: `${device.name} is ${device.state} and reports no statistics` }
    const problem = snapshot.extras.statisticsProblems.get(device.id)
    if (problem) return { problem }
    const statistics = snapshot.extras.statistics.get(device.id)
    if (!statistics) return undefined
    const value = this.metric(statistics)
    return value === undefined ? { problem: `${device.name} doesn't report its ${this.what}` } : Value.number(value)
  }

  protected abstract metric(statistics: Statistics): number | undefined
}
