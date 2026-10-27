/** Small numeric helpers shared by the conversions. */
export class Numbers {
  /** clamps to [min, max]; undefined, NaN and ±Infinity become the fallback */
  static clamp(value: number | undefined, min: number, max: number, fallback = min): number {
    if (value === undefined || !Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, value))
  }

  /** clamps to 0–100 and rounds, the resolution of the Loxone wire format */
  static percent(value: number | undefined, fallback = 0): number {
    return Math.round(Numbers.clamp(value, 0, 100, fallback))
  }

  /** a fade time in seconds as the wire carries it: 0–6553.5 s in steps of 0.1 s; invalid becomes 0.2 s */
  static fade(seconds: number) {
    return Math.round(Numbers.clamp(seconds, 0, 6553.5, 0.2) * 10) / 10
  }

  /** linear mapping; an empty source range (min === max) maps everything to toMin instead of NaN */
  static scale(value: number, min: number, max: number, toMin: number, toMax: number) {
    if (min === max) return toMin
    return ((value - min) * (toMax - toMin)) / (max - min) + toMin
  }

  /** 0–100 percent as two hex digits of 0–255, rounded down (like the old converter); out-of-range input is clamped */
  static percentToHex(value: number) {
    return Math.floor(Numbers.clamp(Numbers.scale(value, 0, 100, 0, 255), 0, 255)).toString(16).padStart(2, "0")
  }
}
