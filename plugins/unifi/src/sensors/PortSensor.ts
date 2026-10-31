import type { Device, Port } from "../api/ApiSchemas.ts"
import type { NetworkSnapshot } from "../poll/NetworkSnapshot.ts"
import { portParamsSchema, type PortParams } from "../params/PortParams.ts"
import { DeviceSensor, type Reading } from "./DeviceSensor.ts"

/** Something about one port of a device ("Port overview" in the device's details). */
export abstract class PortSensor extends DeviceSensor<PortParams> {
  static override readonly params = portParamsSchema

  override start() {
    this.onDispose(this.plugin.demand.need("ports", this.mac))
    super.start()
  }

  protected read(device: Device, snapshot: NetworkSnapshot): Reading {
    const problem = snapshot.extras.portProblems.get(device.id)
    if (problem) return { problem }
    const ports = snapshot.extras.ports.get(device.id)
    if (!ports) return undefined
    const port = ports.find(entry => entry.idx === this.params.port)
    return port ? this.readPort(port, device) : { problem: `${device.name} has no port ${this.params.port}` }
  }

  protected abstract readPort(port: Port, device: Device): Reading
}
