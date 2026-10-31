/** The chime's sounds by id (1–4): names for Loxone to tell apart, as the apps list them. */
export class ChimeSounds {
  static readonly NAMES = ["Ding dong", "Bell", "Gong", "Melody"]

  static installed() {
    return ChimeSounds.NAMES.map((name, index) => ({ chimeId: index + 1, name }))
  }

  static has(chimeId: number) {
    return Number.isInteger(chimeId) && chimeId >= 1 && chimeId <= ChimeSounds.NAMES.length
  }

  /** a sound's name, for the panel */
  static name(chimeId: number) {
    return ChimeSounds.NAMES[chimeId - 1] ?? `sound ${chimeId}`
  }
}
