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

  /** linear mapping from [min, max] to [toMin, toMax], not clamped; min must differ from max (otherwise the result is NaN or Infinity) */
  static scale(value: number, min: number, max: number, toMin: number, toMax: number) {
    return ((value - min) * (toMax - toMin)) / (max - min) + toMin
  }

  /** 0–100 percent as two hex digits of 0–255, rounded down (like the old converter); out-of-range input is clamped */
  static percentToHex(value: number) {
    return Math.floor(Numbers.clamp(Numbers.scale(value, 0, 100, 0, 255), 0, 255)).toString(16).padStart(2, "0")
  }
}
