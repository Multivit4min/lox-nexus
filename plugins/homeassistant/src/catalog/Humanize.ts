/** acronyms that Home Assistant writes in capitals */
const ACRONYMS = new Set(["ai", "tts", "stt", "hvac", "ip", "rssi", "uv", "co2", "pm25", "pm10"])

/** Readable names for Home Assistant identifiers in catalog labels, which become signal names. */
export class Humanize {
  /** a domain as a folder name, e.g. binary_sensor → "Binary sensor" */
  static domain(domain: string) {
    const words = Humanize.words(domain)
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  /** an attribute within a label, e.g. current_position → "current position" */
  static attribute(attribute: string) {
    return Humanize.words(attribute)
  }

  private static words(id: string) {
    return id.split("_").filter(word => word !== "").map(word => ACRONYMS.has(word) ? word.toUpperCase() : word).join(" ")
  }
}
