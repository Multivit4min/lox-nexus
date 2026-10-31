import type { Cell, Tone } from "@lox-nexus/plugin-sdk"

/** Colours for the API's states: device states ("Adopted device overview".state), link and PoE states. */
export class StateTone {
  private static readonly DEVICE: Record<string, Tone> = {
    ONLINE: "ok",
    OFFLINE: "error",
    CONNECTION_INTERRUPTED: "error",
    ISOLATED: "error",
    U5G_INCORRECT_TOPOLOGY: "error",
    UPDATING: "warn",
    GETTING_READY: "warn",
    ADOPTING: "warn",
    PENDING_ADOPTION: "warn",
    DELETING: "muted"
  }

  /** a device state; one a newer Network version adds shows as info */
  static device(state: string): Cell {
    return { text: StateTone.words(state), tone: StateTone.DEVICE[state] ?? "info" }
  }

  /** a port's link: up ok, down muted (an empty port is normal) */
  static link(state: string): Cell {
    return { text: StateTone.words(state), tone: state === "UP" ? "ok" : state === "DOWN" ? "muted" : "info" }
  }

  /** a port's PoE: supplying ok, limited warn, off or down muted */
  static poe(enabled: boolean, state: string): Cell {
    if (!enabled) return { text: "off", tone: "muted" }
    const tone: Tone = state === "UP" ? "ok" : state === "LIMITED" ? "warn" : "muted"
    return { text: StateTone.words(state), tone }
  }

  /** "GETTING_READY" reads "getting ready" */
  static words(state: string) {
    return state.toLowerCase().replace(/_/g, " ")
  }
}
