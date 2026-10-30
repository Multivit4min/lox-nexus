import { Observable } from "@matter/main"
import { DoorLockServer, LockOperationFailedError } from "@matter/main/behaviors/door-lock"
import { DoorLock } from "@matter/main/clusters/door-lock"

/** what matter.js passes to handleLockOperation */
interface LockOperation { actuation: string }

/**
 * A door lock that moves nothing itself: a lock request from a controller goes to Nexus. Unlock
 * requests are refused (FAILURE, with a LockOperationError "restricted" event) unless the device
 * allows unlocking; nothing is ever unlocked silently. PIN codes are left to the apps (Alexa's
 * voice code); none are kept in Nexus.
 */
export class LockServer extends DoorLockServer {
  static override readonly State = class extends DoorLockServer.State {
    /** set from the device's "Allow unlocking"; not a Matter attribute */
    allowUnlock = false
  }

  static override readonly Events = class extends DoorLockServer.Events {
    /** a controller asked to lock (true) or unlock (false), and was allowed to */
    requested = Observable<[lock: boolean, context: unknown]>()
  }

  declare state: InstanceType<typeof LockServer.State>
  declare readonly events: InstanceType<typeof LockServer.Events>

  override handleLockOperation(operation: LockOperation) {
    const lock = operation.actuation === "lock"
    if (!lock && !this.state.allowUnlock) {
      throw new LockOperationFailedError(DoorLock.OperationError.Restricted, "Unlocking from a controller is not allowed for this lock (Allow unlocking in Nexus)")
    }
    this.events.requested.emit(lock, this.context)
  }
}
