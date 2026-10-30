import { Endpoint } from "@matter/main"
import { BridgedDeviceBasicInformationServer } from "@matter/main/behaviors/bridged-device-basic-information"
import { DoorLock } from "@matter/main/clusters/door-lock"
import { DoorLockDevice } from "@matter/main/devices/door-lock"
import { BridgedDevice } from "./BridgedDevice.ts"
import type { KindValue } from "./DeviceKinds.ts"
import type { DeviceRecord } from "./DeviceRecord.ts"
import { LockServer } from "./LockServer.ts"

const LockEndpoint = DoorLockDevice.with(BridgedDeviceBasicInformationServer, LockServer)
const { LockState } = DoorLock

/**
 * A door lock. Nexus sends whether it is locked; a controller's lock request (true lock, false
 * unlock) becomes a command, and unlocking only when the device allows it. Starts with the state
 * Nexus sent last, or unknown.
 */
export class BridgedLock extends BridgedDevice {
  readonly endpoint = new Endpoint(LockEndpoint, {
    id: this.identity.endpointId,
    bridgedDeviceBasicInformation: this.basicInformation(),
    doorLock: {
      lockState: BridgedLock.lockState(this.remembered("locked")),
      lockType: DoorLock.LockType.DeadBolt,
      actuatorEnabled: true,
      operatingMode: DoorLock.OperatingMode.Normal,
      allowUnlock: this.allowUnlock
    }
  })

  override async sync(record: DeviceRecord = this.toRecord()) {
    await super.sync(record)
    if (this.endpoint.state.doorLock.allowUnlock !== record.allowUnlock) await this.endpoint.set({ doorLock: { allowUnlock: record.allowUnlock } })
  }

  protected override subscribe() {
    this.listen(this.endpoint.events.doorLock.requested, (lock, context) => {
      // the endpoint refuses unlocking on its own; this guards against it ever being out of step
      if (!lock && !this.allowUnlock) return this.context.warn(`dropped an unlock request for "${this.name}": unlocking is not allowed for it`)
      this.command("lock", lock, context)
    })
  }

  protected async apply(_kind: string, value: KindValue) {
    await this.endpoint.set({ doorLock: { lockState: BridgedLock.lockState(value) } })
  }

  private static lockState(locked: KindValue | undefined) {
    if (locked === undefined) return null
    return locked === true ? LockState.Locked : LockState.Unlocked
  }
}
