import assert from "node:assert/strict"
import { test } from "node:test"
import type { PluginSignalDto } from "@lox-nexus/api"
import type { CatalogNode } from "@lox-nexus/plugin-sdk/wire"
import { CatalogTree } from "./CatalogTree.ts"

const tree: CatalogNode[] = [{
  label: "Site",
  entries: [{ kind: "sensor", capability: "powerflow", params: { path: "grid", scale: 1 }, label: "Grid power" }],
  children: [{ label: "Meter 0", entries: [{ kind: "sensor", capability: "meter", params: { id: 0 }, label: "Meter power" }] }]
}]

test("rows flatten the tree depth first with their path", () => {
  assert.deepEqual(CatalogTree.rows(tree).map(row => [row.path, row.entry.label]), [["Site", "Grid power"], ["Site ▸ Meter 0", "Meter power"]])
  assert.equal(new Set(CatalogTree.rows(tree).map(row => row.key)).size, 2)
})

test("an entry is configured when kind, capability and params match, whatever the key order", () => {
  const signal = { kind: "sensor", capability: "powerflow", params: { scale: 1, path: "grid" } } as PluginSignalDto
  const [grid, meter] = CatalogTree.rows(tree)
  assert.equal(CatalogTree.configured(grid!.entry, [signal]), true)
  assert.equal(CatalogTree.configured(meter!.entry, [signal]), false)
  assert.equal(CatalogTree.configured(grid!.entry, [{ ...signal, kind: "actuator" }]), false)
})
