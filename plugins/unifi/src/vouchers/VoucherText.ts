/** How vouchers read for people: their validity and codes. */
export class VoucherText {
  /** "90 min", "8 h", "1 day", "3 days 2 h" */
  static duration(minutes: number) {
    if (minutes < 60) return `${minutes} min`
    const days = Math.floor(minutes / 1440)
    const hours = Math.floor((minutes % 1440) / 60)
    const rest = minutes % 60
    const parts = [days ? `${days} day${days === 1 ? "" : "s"}` : "", hours ? `${hours} h` : "", rest ? `${rest} min` : ""]
    return parts.filter(Boolean).join(" ")
  }

  /** "1 guest", "3 guests", "any number of guests" */
  static guests(limit: number | undefined) {
    if (limit === undefined) return "any number of guests"
    return `${limit} guest${limit === 1 ? "" : "s"}`
  }
}
