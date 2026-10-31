import { CatalogTree, type PluginPackageDto, type PluginSignalDto } from "@lox-nexus/api"
import { ValueFormatter } from "@lox-nexus/plugin-sdk/values"
import { z } from "zod"
import { SecretFields } from "../../../plugins/SecretFields.ts"
import { CompactTable } from "../../CompactTable.ts"
import type { McpTool } from "../../McpTool.ts"
import type { CatalogCache } from "./CatalogCache.ts"
import type { PluginRefs } from "./PluginRefs.ts"

const Input = z.object({
  instance: z.string().min(1).max(100).describe("the plugin instance's slug"),
  query: z.string().max(200).optional().describe("words that must all appear in the path, label or capability, e.g. \"kitchen temperature\""),
  kind: z.enum(["sensor", "actuator"]).optional(),
  unconfigured: z.boolean().optional().describe("only entries that aren't signals yet"),
  limit: z.number().int().min(1).max(50).default(25),
  cursor: z.string().max(20).optional()
})

/** Searches what a running plugin instance offers to add, e.g. Home Assistant entities. */
export class SearchCatalogTool implements McpTool<z.infer<typeof Input>> {
  readonly name = "search_catalog"
  readonly title = "Search a plugin's catalog"
  readonly description = "Search what a running plugin instance offers to add as signals (Home Assistant entities, Fronius values, …): path, label, kind, capability, params, the current value, and whether it is configured already. Pass the entries you want (kind, capability, params, label) to plan_bridge."
  readonly scope = "read" as const
  readonly annotations = { readOnlyHint: true, idempotentHint: true }
  readonly input = Input
  private readonly values = new ValueFormatter()

  constructor(
    private readonly refs: PluginRefs,
    private readonly catalogs: Pick<CatalogCache, "get">,
    private readonly signals: { list(instanceId: string): PluginSignalDto[] }
  ) {}

  async run(input: z.infer<typeof Input>) {
    const instance = this.refs.instance(input.instance)
    const pkg = this.refs.package(instance.plugin)
    const configured = this.signals.list(instance.id)
    const words = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
    const rows = CatalogTree.rows(await this.catalogs.get(instance.id)).filter(({ path, entry }) => {
      const text = `${path} ${entry.label} ${entry.capability}`.toLowerCase()
      return (!input.kind || entry.kind === input.kind) && words.every(word => text.includes(word))
        && (!input.unconfigured || !CatalogTree.configured(entry, configured))
    })
    const page = CompactTable.page(rows, input.limit, input.cursor)
    const table = CompactTable.of(page.items, [
      ["path", row => row.path],
      ["label", row => row.entry.label],
      ["kind", row => row.entry.kind],
      ["capability", row => row.entry.capability],
      ["params", row => SearchCatalogTool.params(pkg, row.entry)],
      ["value", row => (row.entry.value ? `${this.values.format(row.entry.value)}${row.entry.unit ? ` ${row.entry.unit}` : ""}` : undefined)],
      ["configured", row => CatalogTree.configured(row.entry, configured)]
    ])
    return { ...table, total: page.total, ...(page.next ? { next: page.next } : {}) }
  }

  // secret params never reach an agent, as on signals; such an entry is added in the web UI
  private static params(pkg: PluginPackageDto, entry: { kind: string; capability: string; params?: unknown }) {
    const capability = (entry.kind === "sensor" ? pkg.description.sensors : pkg.description.actuators).find(offered => offered.id === entry.capability)
    return capability ? new SecretFields(capability.params).strip(entry.params ?? {}) : {}
  }
}
