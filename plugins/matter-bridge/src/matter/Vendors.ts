import type { Controller } from "./PairingWindows.ts"

/** Names for the vendor ids of the common Matter ecosystems, so the panel says "Amazon" instead of a number. */
export class Vendors {
  private static readonly names: ReadonlyMap<number, string> = new Map([
    [0x1217, "Amazon Alexa"],
    [0x6006, "Google Home"],
    [0x1349, "Apple Home"],
    [0x1384, "Apple Home"],
    [0xfff1, "Test controller"]
  ])

  static name(vendorId: number) {
    return Vendors.names.get(vendorId)
  }

  static hex(vendorId: number) {
    return `0x${vendorId.toString(16).toUpperCase().padStart(4, "0")}`
  }

  /** the fabric's label, else the vendor's name, else its id */
  static describe(label: string, vendorId: number) {
    return label || Vendors.name(vendorId) || `vendor ${Vendors.hex(vendorId)}`
  }

  /** a paired controller by its fabric index, for logs and answers: "Amazon Alexa (fabric 1)" */
  static describeFabric(controllers: readonly Controller[], fabricIndex: number) {
    const controller = controllers.find(candidate => candidate.fabricIndex === fabricIndex)
    return controller ? `${Vendors.describe(controller.label, controller.vendorId)} (fabric ${fabricIndex})` : `fabric ${fabricIndex}`
  }
}
