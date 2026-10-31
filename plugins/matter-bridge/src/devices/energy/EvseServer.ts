import { Observable } from "@matter/main"
import { EnergyEvseServer } from "@matter/main/behaviors/energy-evse"
import { EnergyEvse } from "@matter/main/clusters/energy-evse"

const { State, SupplyState, EnergyTransferStoppedReason } = EnergyEvse

/** what Nexus reports about the car at the wallbox */
export interface Vehicle { pluggedIn: boolean; charging: boolean }

/**
 * A wallbox that charges nothing itself. Enable and disable charging from an app (with a maximum
 * current) set the supply state at once and go to Nexus; whether a car is plugged in and charging,
 * and the session's energy, come from Nexus. Each change of the car's state sends Matter's events:
 * EVConnected (a new session), EnergyTransferStarted and Stopped, and EVNotDetected.
 */
export class EvseServer extends EnergyEvseServer {
  static override readonly State = class extends EnergyEvseServer.State {
    override state = State.NotPluggedIn
    override supplyState = SupplyState.ChargingEnabled
    override faultState = EnergyEvse.FaultState.NoError
    /** null: no end; disabling shows in the supply state (matter.js refuses Matter's 0 for it) */
    override chargingEnabledUntil: number | null = null
    /** 32 A, a common wallbox circuit; currents in mA */
    override circuitCapacity = 32_000
    override minimumChargeCurrent = 6_000
    override maximumChargeCurrent = 16_000
    override sessionId: number | null = null
    override sessionDuration: number | null = null
    override sessionEnergyCharged: number | null = null
    /** when the session started (ms on the plugin's clock); not a Matter attribute */
    sessionStart = 0
  }

  static override readonly Events = class extends EnergyEvseServer.Events {
    /** an app enabled (with the maximum current in A) or disabled charging */
    requested = Observable<[enabled: boolean, maxCurrent: number | undefined, context: unknown]>()
  }

  declare state: InstanceType<typeof EvseServer.State>
  declare readonly events: InstanceType<typeof EvseServer.Events>

  override disable() {
    this.state.supplyState = SupplyState.Disabled
    this.state.chargingEnabledUntil = null
    this.events.requested.emit(false, undefined, this.context)
  }

  override enableCharging(request: EnergyEvse.EnableChargingRequest) {
    const maximum = Math.min(Number(request.maximumChargeCurrent), this.state.circuitCapacity)
    this.state.supplyState = SupplyState.ChargingEnabled
    this.state.chargingEnabledUntil = request.chargingEnabledUntil
    this.state.maximumChargeCurrent = Math.max(this.state.minimumChargeCurrent, maximum)
    this.events.requested.emit(true, this.state.maximumChargeCurrent / 1000, this.context)
  }

  /** the car's state from Nexus, with the events its change means; `now` in ms */
  vehicle(vehicle: Vehicle, now: number) {
    const before = this.state.state
    const wasPlugged = before !== State.NotPluggedIn
    const wasCharging = before === State.PluggedInCharging
    if (vehicle.pluggedIn && !wasPlugged) this.connect(now)
    this.state.state = EvseServer.stateOf(vehicle, this.state.supplyState)
    this.tick(now)
    const sessionId = this.state.sessionId ?? 0
    const energy = this.state.sessionEnergyCharged ?? 0
    if (vehicle.charging && !wasCharging) {
      this.events.energyTransferStarted.emit({ sessionId, state: this.state.state, maximumCurrent: this.state.maximumChargeCurrent }, this.context)
    }
    if (!vehicle.charging && wasCharging) {
      const reason = this.state.supplyState === SupplyState.Disabled ? EnergyTransferStoppedReason.EvseStopped : EnergyTransferStoppedReason.EvStopped
      this.events.energyTransferStopped.emit({ sessionId, state: before, reason, energyTransferred: energy }, this.context)
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

  /** a supply state from Nexus: charging enabled or not */
  supply(enabled: boolean, vehicle: Vehicle) {
    this.state.supplyState = enabled ? SupplyState.ChargingEnabled : SupplyState.Disabled
    this.state.chargingEnabledUntil = null
    this.state.state = EvseServer.stateOf(vehicle, this.state.supplyState)
  }

  private connect(now: number) {
    this.state.sessionId = (this.state.sessionId ?? 0) + 1
    this.state.sessionStart = now
    this.state.sessionDuration = 0
    this.state.sessionEnergyCharged = 0
    this.events.evConnected.emit({ sessionId: this.state.sessionId }, this.context)
  }

  /** the session's duration follows each report while a car is plugged in */
  private tick(now: number) {
    if (this.state.state !== State.NotPluggedIn && this.state.sessionId !== null) {
      this.state.sessionDuration = Math.max(0, Math.round((now - this.state.sessionStart) / 1000))
    }
  }

  /** charging, or plugged in: waiting while enabled (the car wants nothing), wanting while disabled */
  static stateOf(vehicle: Vehicle, supply: EnergyEvse.SupplyState) {
    if (!vehicle.pluggedIn) return State.NotPluggedIn
    if (vehicle.charging) return State.PluggedInCharging
    return supply === SupplyState.Disabled ? State.PluggedInDemand : State.PluggedInNoDemand
  }
}
