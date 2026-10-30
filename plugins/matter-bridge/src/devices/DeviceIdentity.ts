import { createHash } from "node:crypto"
import type { DeviceConfig } from "../config/BridgeConfig.ts"

/**
 * How a configured device is known to matter.js and to the controllers. Derived from its name and
 * type: the endpoint id keeps its endpoint number across restarts (so Alexa keeps the device), and
 * renaming or changing the type makes a new device.
 */
export class DeviceIdentity {
  /** matter.js endpoint id; also a storage context, so no dots */
  readonly endpointId: string
  /** BridgedDeviceBasicInformation.uniqueId (at most 32 characters) */
  readonly uniqueId: string
  /** BridgedDeviceBasicInformation.serialNumber, which must differ from the unique id */
  readonly serialNumber: string

  constructor(device: Pick<DeviceConfig, "name" | "type">) {
    const hash = createHash("sha256").update(`${device.type}\n${device.name}`).digest("hex")
    this.endpointId = `device-${hash.slice(0, 16)}`
    this.uniqueId = `lox-nexus-${hash.slice(0, 20)}`
    this.serialNumber = `LN${hash.slice(20, 32).toUpperCase()}`
  }

  /** the bridged basic information a device endpoint starts with */
  basicInformation(name: string) {
    return { nodeLabel: name, productName: name, reachable: true, uniqueId: this.uniqueId, serialNumber: this.serialNumber }
  }
}
