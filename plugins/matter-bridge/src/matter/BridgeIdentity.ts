import { createHash } from "node:crypto"
import { VendorId } from "@matter/main"
import { AggregatorEndpoint } from "@matter/main/endpoints/aggregator"

/**
 * How the bridge itself presents: the Matter test vendor (the bridge is not certified), stable
 * serial number and unique id per Nexus instance, and the plugin's version.
 */
export class BridgeIdentity {
  static readonly VERSION = "0.1.0"
  /** 0xFFF1 is a test vendor id: controllers show the bridge as uncertified */
  static readonly VENDOR_ID = 0xfff1
  static readonly PRODUCT_ID = 0x8000

  private readonly hash: string

  constructor(instanceId: string, private readonly name: string) {
    this.hash = createHash("sha256").update(`lox-nexus-bridge\n${instanceId}`).digest("hex")
  }

  /** the version as Matter's uint32: 0.1.0 is 100 */
  static softwareVersion(version = BridgeIdentity.VERSION) {
    const [major = 0, minor = 0, patch = 0] = version.split(".").map(part => Number.parseInt(part, 10) || 0)
    return major * 10_000 + minor * 100 + patch
  }

  productDescription() {
    return { name: this.name, deviceType: AggregatorEndpoint.deviceType }
  }

  basicInformation() {
    return {
      vendorName: "Lox Nexus Project",
      vendorId: VendorId(BridgeIdentity.VENDOR_ID),
      productName: "Lox Nexus Matter bridge",
      productId: BridgeIdentity.PRODUCT_ID,
      nodeLabel: this.name,
      hardwareVersion: 1,
      hardwareVersionString: "1",
      softwareVersion: BridgeIdentity.softwareVersion(),
      softwareVersionString: BridgeIdentity.VERSION,
      serialNumber: `LN${this.hash.slice(0, 14).toUpperCase()}`,
      uniqueId: `lox-nexus-${this.hash.slice(16, 36)}`
    }
  }
}
