import type { CatalogEntry, CatalogNode } from "@lox-nexus/plugin-sdk"
import { SnapshotPath } from "../SnapshotPath.ts"
import type { FroniusSnapshot } from "../SolarApiTypes.ts"
import { CatalogFields, type CatalogField } from "./CatalogFields.ts"

/**
 * The browsable tree of ready-to-add value sensors, built from the latest poll, so it lists only
 * what this installation actually reports: Site, then one node per inverter, meter, storage and
 * Ohm Pilot. Empty before the first successful poll.
 */
export class FroniusCatalog {
  constructor(private readonly snapshot: FroniusSnapshot | undefined) {}

  /** only fields with a usable value are offered; nullable ones (e.g. PV at night) only where the field allows it */
  build(): CatalogNode[] {
    if (!this.snapshot) return []
    const nodes = [
      this.node("Site", this.entries(["powerflow", "Site"], CatalogFields.site, "")),
      this.devices("Inverters", "Inverter", ["powerflow", "Inverters"], [], CatalogFields.inverter),
      this.devices("Meters", "Meter", ["meter"], [], CatalogFields.meter),
      this.devices("Storages", "Storage", ["storage"], ["Controller"], CatalogFields.storage),
      this.devices("Ohm Pilots", "Ohm Pilot", ["powerflow", "Smartloads", "Ohmpilots"], [], CatalogFields.ohmpilot)
    ]
    return nodes.filter(node => node !== undefined)
  }

  /** one child per device id below `base`; `inner` leads from the device to its fields */
  private devices(label: string, singular: string, base: string[], inner: string[], fields: readonly CatalogField[]) {
    const devices = this.at(base)
    if (!FroniusCatalog.isRecord(devices)) return undefined
    const children = Object.keys(devices).map(id => {
      const name = `${singular} ${id}${FroniusCatalog.model(this.at([...base, id, ...inner, "Details", "Model"]))}`
      return this.node(name, this.entries([...base, id, ...inner], fields, `${singular} ${id} `))
    }).filter(node => node !== undefined)
    return children.length > 0 ? { label, children } : undefined
  }

  private entries(base: string[], fields: readonly CatalogField[], prefix: string): CatalogEntry[] {
    return fields.filter(field => this.offers([...base, field.key], field)).map(field => ({
      kind: "sensor" as const,
      capability: "value",
      params: { path: SnapshotPath.join(...base, field.key) },
      label: `${prefix}${field.label}`
    }))
  }

  private offers(segments: string[], field: CatalogField) {
    const value = this.at(segments)
    if (value === null) return field.nullable === true
    return ["number", "string", "boolean"].includes(typeof value)
  }

  private node(label: string, entries: CatalogEntry[]): CatalogNode | undefined {
    return entries.length > 0 ? { label, entries } : undefined
  }

  private at(segments: string[]) {
    return this.snapshot ? SnapshotPath.resolve(this.snapshot, SnapshotPath.join(...segments)) : undefined
  }

  private static model(model: unknown) {
    return typeof model === "string" && model !== "" ? ` (${model})` : ""
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
