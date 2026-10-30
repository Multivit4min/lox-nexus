import { createHash } from "node:crypto"

/**
 * How a device is known to matter.js and to the controllers, derived from its id (or, for devices
 * taken over from the old config, from their type and name then). The endpoint id keeps its endpoint
 * number across restarts, so Alexa keeps the device; renaming keeps all of it.
 */
export class DeviceIdentity {
  /** matter.js endpoint id; also a storage context, so no dots */
  readonly endpointId: string
  /** BridgedDeviceBasicInformation.uniqueId (at most 32 characters) */
  readonly uniqueId: string
  /** BridgedDeviceBasicInformation.serialNumber, which must differ from the unique id */
  readonly serialNumber: string

  constructor(seed: string) {
    const hash = createHash("sha256").update(seed).digest("hex")
    this.endpointId = `device-${hash.slice(0, 16)}`
    this.uniqueId = `lox-nexus-${hash.slice(0, 20)}`
    this.serialNumber = `LN${hash.slice(20, 32).toUpperCase()}`
  }

  /** the bridged basic information a device endpoint starts with; the label follows renames */
  basicInformation(name: string, productName: string) {
    return { nodeLabel: name, productName, reachable: true, uniqueId: this.uniqueId, serialNumber: this.serialNumber }
  }
}
