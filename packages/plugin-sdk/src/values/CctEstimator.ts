import type { Rgbw } from "./Value.ts"

/**
 * Estimates a colour temperature from an RGB tint by projecting it onto the line between a
 * cold (cyan) and a warm (amber) reference colour. Ported from the old converter.
 */
export class CctEstimator {
  /** Kelvin values assigned to the warm (amber) and cold (cyan) reference colours. */
  constructor(private readonly warmKelvin = 2700, private readonly coldKelvin = 6500) {}

  /**
   * Mixes the temperature as a mired (1/K) interpolation, which matches how tunable white
   * fixtures blend. Only red, green and blue are considered, the white channel is ignored.
   * @returns Kelvin between warmKelvin and coldKelvin, never NaN
   */
  fromRgbw(rgbw: Rgbw): number {
    const color = [rgbw.red, rgbw.green, rgbw.blue].map(channel => Math.floor(channel * 2.55))
    const cold = [0, 255, 255]
    const warm = [232, 155, 0]
    const v = warm.map((w, i) => w - cold[i]!)
    const w = color.map((c, i) => c - cold[i]!)
    const denominator = v.reduce((sum, x) => sum + x * x, 0) || 1
    const t = Math.max(0, Math.min(1, v.reduce((sum, x, i) => sum + x * w[i]!, 0) / denominator))
    return Math.round(1 / ((1 - t) / this.coldKelvin + t / this.warmKelvin))
  }
}
