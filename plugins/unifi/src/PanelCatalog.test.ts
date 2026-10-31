import assert from "node:assert/strict"
import { test } from "node:test"
import type { CatalogNode, Panel, PanelPart } from "@lox-nexus/plugin-sdk"
import { cellText } from "@lox-nexus/plugin-sdk/testing"
import { UnifiHarness } from "./test-support/UnifiHarness.ts"

function part(panel: Panel | undefined, title: string): PanelPart | undefined {
  return panel?.type === "sections" ? panel.sections.filter(section => section.title === title).at(-1)?.panel : undefined
}

test("the panel shows the console, Wi-Fi switches, devices with Restart, PoE ports with Power-cycle and the clients", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const panel = await unifi.host.panel()
    const consolePart = part(panel, "Console")
    assert.ok(consolePart?.type === "keyValue")
    const facts = Object.fromEntries(consolePart.items.map(item => [item.label, cellText(item.value)]))
    assert.equal(facts["UniFi Network"], "10.3.58")
    assert.equal(facts.Site, "Default")
    assert.match(facts.Certificate ?? "", /^pinned/)

    const wifi = part(panel, "Wi-Fi networks")
    assert.ok(wifi?.type === "keyValue")
    const guests = wifi.items.find(item => item.label === "Guests")!
    assert.deepEqual(guests.control, { action: "set-wifi", switch: { checked: false }, input: { network: "00000000-0000-4000-8000-000000000302", enabled: true } })

    const devices = part(panel, "Devices")
    assert.ok(devices?.type === "table")
    const states = Object.fromEntries(devices.rows.map(row => [cellText(row[0]), row[2]]))
    assert.deepEqual(states["Hall AP"], { text: "online", tone: "ok" })
    assert.deepEqual(states["Garden AP"], { text: "offline", tone: "error" })
    assert.deepEqual(states["Attic AP"], { text: "updating", tone: "warn" })
    assert.deepEqual(devices.rowActions?.[0], [{ action: "restart-device", label: "Restart", instant: true, input: { device: "02:00:00:00:00:04" } }])

    const ports = part(panel, "Ports")
    assert.ok(ports?.type === "table")
    assert.deepEqual(ports.rowActions?.map(actions => actions.length), [1, 1, 0, 0], "only ports with PoE on can be power-cycled")
    assert.deepEqual(ports.rowActions?.[1]?.[0], { action: "power-cycle-port", label: "Power-cycle", instant: true, input: { device: "02:00:00:00:00:02", port: 2 } })

    const clients = part(panel, "Connected clients")
    assert.ok(clients?.type === "table")
    assert.equal(clients.rows.length, 5)
    const tablet = clients.rows.findIndex(row => cellText(row[0]) === "Guest Tablet")
    assert.equal(clients.rowActions?.[tablet]?.[0]?.label, "Authorize")
    assert.ok(!JSON.stringify(panel).includes("passphrase") && !JSON.stringify(panel).includes("synthetic-test-key"), "no secrets")
  } finally {
    await unifi.stop()
  }
})

test("the Wi-Fi switch runs set-wifi and the panel follows", async () => {
  const unifi = await UnifiHarness.start()
  try {
    assert.equal(await unifi.host.action("set-wifi", { network: "00000000-0000-4000-8000-000000000302", enabled: true }), "Guests is on")
    const wifi = part(await unifi.host.panel(), "Wi-Fi networks")
    assert.ok(wifi?.type === "keyValue")
    assert.deepEqual(wifi.items.find(item => item.label === "Guests")?.control?.switch, { checked: true })
    assert.equal(await unifi.host.action("restart-device", { device: "02:00:00:00:00:01" }), "Hall AP is restarting")
    assert.equal(await unifi.host.action("power-cycle-port", { device: "02:00:00:00:00:02", port: 1 }), "Port 1 of Garage Switch is power-cycling")
    assert.equal(await unifi.host.action("guest-access", { client: "02:00:00:00:10:03", authorize: true, minutes: 60 }), "Authorized Guest Tablet for 60 min")
  } finally {
    await unifi.stop()
  }
})

test("the catalog offers clients by MAC and by name, devices with ports, Wi-Fi networks and vouchers", async () => {
  const unifi = await UnifiHarness.start()
  try {
    const catalog = await unifi.host.catalog()
    const find = (nodes: CatalogNode[] | undefined, label: string) => nodes?.find(node => node.label === label)
    assert.deepEqual(catalog.map(node => node.label), ["Clients (connected now)", "Devices", "Wi-Fi networks", "Vouchers"])
    const phone = find(catalog[0]!.children, "Phone A (02:00:00:00:10:01)")!
    assert.deepEqual(phone.entries?.map(entry => `${entry.capability} ${JSON.stringify(entry.params)}`), [
      'client-connected {"client":"02:00:00:00:10:01","matchBy":"mac"}',
      'client-uplink {"client":"02:00:00:00:10:01","matchBy":"mac"}',
      'client-ip {"client":"02:00:00:00:10:01","matchBy":"mac"}',
      'client-connected {"client":"Phone A","matchBy":"name"}',
      'client-uplink {"client":"Phone A","matchBy":"name"}',
      'client-ip {"client":"Phone A","matchBy":"name"}'
    ])
    assert.ok(find(catalog[0]!.children, "Guest Tablet (02:00:00:00:10:03)")!.entries!.some(entry => entry.capability === "guest-access"))
    const garage = find(catalog[1]!.children, "Garage Switch (USW Lite 8 PoE)")!
    assert.deepEqual(garage.children?.map(node => node.label), ["Port 1", "Port 2", "Port 3", "Port 9"])
    assert.ok(find(garage.children, "Port 1")!.entries!.some(entry => entry.capability === "port-power-cycle"))
    assert.ok(!find(garage.children, "Port 9")!.entries!.some(entry => entry.capability === "port-power-cycle"))
    const hall = find(catalog[1]!.children, "Hall AP (U6 Lite)")!
    assert.deepEqual(hall.children?.map(node => node.label), ["Port 1"], "an AP's ports are read for the catalog")
    assert.deepEqual(find(catalog, "Wi-Fi networks")!.children?.map(node => node.label), ["Guests", "Home"])
    for (const node of [phone, garage]) {
      for (const entry of node.entries ?? []) {
        if (entry.kind === "sensor") await unifi.host.addSensor(entry.capability, entry.params)
        else await unifi.host.addActuator(entry.capability, entry.params)
      }
    }
  } finally {
    await unifi.stop()
  }
})
