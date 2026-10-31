import assert from "node:assert/strict"
import { test } from "node:test"
import type { Panel } from "@lox-nexus/plugin-sdk/wire"
import { PanelLayout } from "./PanelLayout.ts"

const tiles = [{ label: "PV", value: 3200, unit: "W" }]
const status = { type: "keyValue" as const, items: [{ label: "Reading", value: "ok" }] }

test("the first tiles section goes on top of the page, the other sections stay in the card", () => {
  const panel: Panel = { type: "sections", sections: [{ title: "Connection", panel: status }, { title: "Power flow", panel: { type: "tiles", tiles } }, { title: "More", panel: { type: "tiles", tiles: [] } }] }
  const { headline, rest } = PanelLayout.split(panel)
  assert.deepEqual(headline, tiles)
  assert.deepEqual(rest?.type === "sections" && rest.sections.map(section => section.title), ["Connection", "More"])
})

test("a panel of tiles only has no card; one without tiles keeps it all; tiles with heading buttons stay with them", () => {
  assert.deepEqual(PanelLayout.split({ type: "tiles", tiles }), { headline: tiles })
  assert.deepEqual(PanelLayout.split({ type: "sections", sections: [{ title: "Power flow", panel: { type: "tiles", tiles } }] }), { headline: tiles })
  assert.deepEqual(PanelLayout.split(status), { rest: status })
  const withButtons: Panel = { type: "sections", sections: [{ title: "Power flow", panel: { type: "tiles", tiles }, actions: [{ action: "reset" }] }] }
  assert.deepEqual(PanelLayout.split(withButtons), { rest: withButtons })
})
