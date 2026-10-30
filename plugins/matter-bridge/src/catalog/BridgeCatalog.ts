import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import type { BridgedDevice } from "../devices/BridgedDevice.ts"
import { Capabilities } from "../signals/Capabilities.ts"

/** One folder per device with the signals that fit its type, commands first; params refer to the id. */
export class BridgeCatalog {
  constructor(private readonly devices: readonly BridgedDevice[]) {}

  nodes(): CatalogNode[] {
    return this.devices.map(device => ({ label: `${device.name} (${device.info.label})`, entries: BridgeCatalog.entries(device) }))
  }

  private static entries(device: BridgedDevice): CatalogEntry[] {
    const params = { device: device.id }
    const label = (text: string) => `${device.name}: ${text.charAt(0).toLowerCase()}${text.slice(1)}`
    return [
      ...device.info.commands.map(kind => {
        const sensor = Capabilities.sensorFor[kind]
        return { kind: "sensor" as const, capability: sensor.id, params, label: label(sensor.label) }
      }),
      ...device.info.states.map(kind => {
        const actuator = Capabilities.actuatorFor[kind]
        return { kind: "actuator" as const, capability: actuator.id, params, label: label(actuator.label) }
      })
    ]
  }
}
