import { randomBytes } from "node:crypto"

/**
 * Ids for new devices: the name at creation as a slug plus a short random suffix
 * (`kitchen-light-3f2a`), readable in signal lists and stable across renames.
 */
export class DeviceId {
  static create(name: string, taken: ReadonlySet<string>, random = () => randomBytes(2).toString("hex")) {
    const base = DeviceId.slug(name)
    for (;;) {
      const id = `${base}-${random()}`
      if (!taken.has(id)) return id
    }
  }

  /** lowercase ASCII words joined by "-", at most 24 characters; "device" when nothing is left */
  static slug(name: string) {
    const ascii = name.normalize("NFKD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").toLowerCase()
    const slug = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "")
    return slug || "device"
  }
}
