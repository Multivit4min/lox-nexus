import type { Rgbw } from "./Value.ts"

/**
 * Estimates a colour temperature from an RGB tint by projecting it onto the line between a
 * cold (cyan) and a warm (amber) reference colour. Ported from the old converter.
 */
export class CctEstimator {
  constructor(private readonly warmKelvin = 2700, private readonly coldKelvin = 6500) {}

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
