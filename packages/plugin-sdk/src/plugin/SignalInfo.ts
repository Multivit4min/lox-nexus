/** Which configured signal a sensor or actuator instance is, as the user knows it. */
export interface SignalInfo {
  /** the signal's stable id */
  id: string
  /** the name the user gave the signal; "" when the host didn't send one (older hosts) */
  label: string
}
