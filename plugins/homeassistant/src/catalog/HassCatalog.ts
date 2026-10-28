import type { CatalogNode } from "@lox-nexus/plugin-sdk"
import { EntityId } from "../entities/EntityId.ts"
import type { EntityStore } from "../entities/EntityStore.ts"
import { EntityOffers } from "./EntityOffers.ts"
import { Humanize } from "./Humanize.ts"
import type { Registries } from "./Registries.ts"

/**
 * The browsable tree of ready-to-add sensors and actuators: area ▸ domain ("Binary sensor") ▸ entity, with
 * entities without an area under "No area" at the end. Hidden and disabled entities are left out.
 */
export class HassCatalog {
  static readonly NO_AREA = "No area"

  constructor(private readonly entities: Pick<EntityStore, "entries">, private readonly registries: Pick<Registries, "areaOf" | "hidden">) {}

  build(): CatalogNode[] {
    const areas = new Map<string, Map<string, CatalogNode[]>>()
    for (const [entityId, entity] of this.entities.entries()) {
      if (this.registries.hidden(entityId)) continue
      const offers = new EntityOffers(entityId, entity)
      const area = this.registries.areaOf(entityId) ?? HassCatalog.NO_AREA
      const domains = areas.get(area) ?? new Map<string, CatalogNode[]>()
      areas.set(area, domains)
      const domain = Humanize.domain(EntityId.domain(entityId))
      domains.set(domain, [...domains.get(domain) ?? [], { label: `${offers.name} (${entityId})`, entries: offers.entries() }])
    }
    return [...areas.entries()].sort(([a], [b]) => HassCatalog.order(a, b)).map(([label, domains]) => ({
      label,
      children: [...domains.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([domain, nodes]) => ({
        label: domain,
        children: nodes.sort((a, b) => a.label.localeCompare(b.label))
      }))
    }))
  }

  private static order(a: string, b: string) {
    if (a === HassCatalog.NO_AREA || b === HassCatalog.NO_AREA) return Number(a === HassCatalog.NO_AREA) - Number(b === HassCatalog.NO_AREA)
    return a.localeCompare(b)
  }
}
