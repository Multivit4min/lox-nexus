import { Observable } from "@matter/main"
import { EnergyEvseServer } from "@matter/main/behaviors/energy-evse"
import { EnergyEvse } from "@matter/main/clusters/energy-evse"
import { Status, StatusResponseError } from "@matter/main/types"

// Matter's EVSE type needs charging preferences; the bridge keeps an app's targets but plans nothing
const Base = EnergyEvseServer.with("ChargingPreferences")
const { State, SupplyState, EnergyTransferStoppedReason } = EnergyEvse

/** what Nexus reports about the car at the wallbox */
export interface Vehicle { pluggedIn: boolean; charging: boolean }

/**
 * A wallbox that charges nothing itself. Enable and disable charging from an app (with a current
 * range and an end time) set the supply state at once and go to Nexus; whether a car is plugged in
 * and charging, and the session's energy, come from Nexus. Each change of the car's state sends
 * Matter's events: EVConnected (a new session), EnergyTransferStarted and Stopped, EVNotDetected.
 */
export class EvseServer extends Base {
  /** currents in mA: Matter's lowest charging current, and a common 32 A wallbox circuit */
  static readonly MIN_CURRENT = 6_000
  static readonly CIRCUIT = 32_000

  static override readonly State = class extends Base.State {
    override state = State.NotPluggedIn
    override supplyState = SupplyState.ChargingEnabled
    override faultState = EnergyEvse.FaultState.NoError
    /** null: no end */
    override chargingEnabledUntil: number | null = null
    override circuitCapacity = EvseServer.CIRCUIT
    override minimumChargeCurrent = EvseServer.MIN_CURRENT
    override maximumChargeCurrent = 16_000
    override sessionId: number | null = null
    override sessionDuration: number | null = null
    override sessionEnergyCharged: number | null = null
    override nextChargeStartTime = null
    override nextChargeTargetTime = null
    override nextChargeRequiredEnergy = null
    override nextChargeTargetSoC = null
    /** not Matter attributes: the session's start (ms, plugin clock; 0 after a restart), the energy when charging started, an app's targets */
    sessionStart = 0
    transferStart = 0
    targets: EnergyEvse.ChargingTargetSchedule[] = []
  }

  static override readonly Events = class extends Base.Events {
    /** an app enabled (with the maximum current in A and the end in Unix seconds, or null) or disabled charging */
    requested = Observable<[enabled: boolean, maxCurrent: number | undefined, until: number | null, context: unknown]>()
  }

  declare state: InstanceType<typeof EvseServer.State>
  declare readonly events: InstanceType<typeof EvseServer.Events>

  override disable() {
    this.supply(false)
    this.events.requested.emit(false, undefined, null, this.context)
  }

  override enableCharging(request: EnergyEvse.EnableChargingRequest) {
    const minimum = Number(request.minimumChargeCurrent)
    const maximum = Math.min(Number(request.maximumChargeCurrent), this.state.circuitCapacity)
    if (minimum > maximum) throw new StatusResponseError("the minimum current is above the maximum", Status.ConstraintError)
    this.supply(true)
    this.state.chargingEnabledUntil = request.chargingEnabledUntil
    this.state.minimumChargeCurrent = Math.max(EvseServer.MIN_CURRENT, minimum)
    this.state.maximumChargeCurrent = Math.max(this.state.minimumChargeCurrent, maximum)
    this.events.requested.emit(true, this.state.maximumChargeCurrent / 1000, request.chargingEnabledUntil, this.context)
  }

  /** the end time an app gave has come: charging is disabled, as if the app had disabled it */
  expire(until: number) {
    if (this.state.supplyState !== SupplyState.ChargingEnabled || this.state.chargingEnabledUntil !== until) return
    this.disable()
  }

  override setTargets(request: EnergyEvse.SetTargetsRequest) {
    this.state.targets = request.chargingTargetSchedules
  }

  override getTargets() {
    return { chargingTargetSchedules: this.state.targets }
  }

  override clearTargets() {
    this.state.targets = []
  }

  /** the car's state from Nexus, with the events its change means; `now` in ms. A car that isn't plugged in doesn't charge */
  vehicle(reported: Vehicle, now: number) {
    const vehicle = { pluggedIn: reported.pluggedIn, charging: reported.charging && reported.pluggedIn }
    const before = this.state.state
    const wasPlugged = before !== State.NotPluggedIn
    const wasCharging = before === State.PluggedInCharging
    this.tick(now)
    if (vehicle.pluggedIn && !wasPlugged) this.connect(now)
    this.state.state = EvseServer.stateOf(vehicle, this.state.supplyState)
    const sessionId = this.state.sessionId ?? 0
    const energy = this.state.sessionEnergyCharged ?? 0
    if (vehicle.charging && !wasCharging) {
      this.state.transferStart = energy
      this.events.energyTransferStarted.emit({ sessionId, state: this.state.state, maximumCurrent: this.state.maximumChargeCurrent }, this.context)
    }
    if (!vehicle.charging && wasCharging) {
      const reason = this.state.supplyState === SupplyState.Disabled ? EnergyTransferStoppedReason.EvseStopped : EnergyTransferStoppedReason.EvStopped
      const energyTransferred = Math.max(0, energy - this.state.transferStart)
      this.events.energyTransferStopped.emit({ sessionId, state: before, reason, energyTransferred }, this.context)
    }
    if (!vehicle.pluggedIn && wasPlugged) {
      this.events.evNotDetected.emit({ sessionId, state: before, sessionDuration: this.state.sessionDuration ?? 0, sessionEnergyCharged: energy }, this.context)
    }
  }

  /** the session's energy from Nexus, in kWh */
  sessionEnergy(kwh: number, now: number) {
    this.state.sessionEnergyCharged = Math.max(0, Math.round(kwh * 1_000_000))
    this.tick(now)
  }

  /** whether charging is enabled, from Nexus or an app; the state follows for a car that waits */
  supply(enabled: boolean) {
    const charging = this.state.state === State.PluggedInCharging
    this.state.supplyState = enabled ? SupplyState.ChargingEnabled : SupplyState.Disabled
    this.state.chargingEnabledUntil = null
    this.state.state = EvseServer.stateOf({ pluggedIn: this.state.state !== State.NotPluggedIn, charging }, this.state.supplyState)
  }

  private connect(now: number) {
    this.state.sessionId = (this.state.sessionId ?? 0) + 1
    this.state.sessionStart = now
    this.state.sessionDuration = 0
    this.state.sessionEnergyCharged = 0
    this.state.transferStart = 0
    this.events.evConnected.emit({ sessionId: this.state.sessionId }, this.context)
  }

  /**
   * The session's duration follows each report while a car is plugged in. After a restart the
   * start is taken back from the duration matter.js kept (the time the bridge was down is lost).
   */
  private tick(now: number) {
    if (this.state.state === State.NotPluggedIn || this.state.sessionId === null) return
    if (this.state.sessionStart === 0) this.state.sessionStart = now - (this.state.sessionDuration ?? 0) * 1000
    this.state.sessionDuration = Math.max(0, Math.round((now - this.state.sessionStart) / 1000))
  }

  /** charging, or plugged in: waiting while enabled (the car wants nothing), wanting while disabled */
  static stateOf(vehicle: Vehicle, supply: EnergyEvse.SupplyState) {
    if (!vehicle.pluggedIn) return State.NotPluggedIn
    if (vehicle.charging) return State.PluggedInCharging
    return supply === SupplyState.Disabled ? State.PluggedInDemand : State.PluggedInNoDemand
  }
}
