import type { SettingsRepository } from "../db/repositories/SettingsRepository.ts"

/**
 * The installation's time zone (an IANA name such as "Europe/Vienna"), taken from the Loxone
 * project whenever Nexus reads one. Plugins get it at their next start (Plugin.timeZone), so a
 * script's `Date` shows the Miniserver's local time even where the server runs in UTC.
 */
export class TimeZoneSetting {
  static readonly KEY = "timeZone"

  constructor(private readonly repo: Pick<SettingsRepository, "get" | "set">) {}

  /** undefined until a project with a zone was read, or when the stored one is no longer known */
  get(): string | undefined {
    const stored = this.repo.get(TimeZoneSetting.KEY)
    return typeof stored === "string" && TimeZoneSetting.isValid(stored) ? stored : undefined
  }

  /** stores a zone the runtime knows; anything else is ignored. @returns whether it was stored */
  set(zone: string): boolean {
    if (!TimeZoneSetting.isValid(zone)) return false
    if (this.get() !== zone) this.repo.set(TimeZoneSetting.KEY, zone)
    return true
  }

  static isValid(zone: string) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone })
      return zone.length > 0
    } catch {
      return false
    }
  }
}
