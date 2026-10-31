import assert from "node:assert/strict"
import { test } from "node:test"
import { PanelText } from "./PanelText.ts"

const at = Date.UTC(2026, 9, 31, 12)

test("cells read as text with their tone and times; muted is left out", () => {
  assert.equal(PanelText.cell("plain"), "plain")
  assert.equal(PanelText.cell({ text: "running", tone: "ok" }), "running (ok)")
  assert.equal(PanelText.cell({ text: "idle", tone: "muted" }), "idle")
  assert.equal(PanelText.cell({ text: "pairing", until: at }), "pairing (until 2026-10-31T12:00:00.000Z)")
  assert.equal(PanelText.cell({ at }), "(at 2026-10-31T12:00:00.000Z)")
})

test("sections, tables, tiles and notices keep their content; buttons become actions; a QR code stays in the web UI", () => {
  const text = PanelText.of({ type: "sections", sections: [
    { title: "Status", panel: { type: "keyValue", items: [{ label: "Guest Wi-Fi", value: { text: "on", tone: "ok" }, control: { action: "guest", input: { on: false }, switch: { checked: true } } }] } },
    { title: "Clients", panel: { type: "table", columns: ["Name", "State"], rows: [["Phone", { text: "online", tone: "ok" }]], rowActions: [[{ action: "kick", label: "Kick", input: { mac: "aa" } }]] } },
    { title: "Power", panel: { type: "tiles", tiles: [{ label: "PV", value: 3200.456, unit: "W", decimals: 1 }, { label: "Window", value: null, until: at }] } },
    { title: "Pairing", panel: { type: "qr", data: "MT:Y.K90-planted", caption: "Scan in the app" }, actions: [{ action: "open", label: "Open window" }] },
    { title: "Note", panel: { type: "notice", tone: "warn", title: "Not paired", text: "Scan the code", link: { label: "Help", href: "https://example.com" } } },
    { title: "Raw", panel: { type: "json", data: { a: 1 } } }
  ] })
  assert.deepEqual(text, [
    { title: "Status", items: [{ label: "Guest Wi-Fi", value: "on (ok)", action: { action: "guest", input: { on: false }, on: true } }] },
    { title: "Clients", columns: ["Name", "State"], rows: [["Phone", "online (ok)"]], rowActions: [[{ action: "kick", label: "Kick", input: { mac: "aa" } }]] },
    { title: "Power", tiles: [{ label: "PV", value: "3200.5 W" }, { label: "Window", value: "until 2026-10-31T12:00:00.000Z" }] },
    { title: "Pairing", actions: [{ action: "open", label: "Open window" }], qr: "a QR code (Scan in the app), shown on the plugin's page in the web UI" },
    { title: "Note", notice: { tone: "warn", title: "Not paired", text: "Scan the code", link: "https://example.com" } },
    { title: "Raw", data: { a: 1 } }
  ])
  assert.ok(!JSON.stringify(text).includes("planted"), "the QR payload isn't passed on")
})
