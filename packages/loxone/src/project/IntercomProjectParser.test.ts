import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ProjectFixtures } from "../test-support/ProjectFixtures.ts"
import { IntercomProjectParser } from "./IntercomProjectParser.ts"

describe("IntercomProjectParser", () => {
  const project = IntercomProjectParser.parse(ProjectFixtures.XML)

  test("reads the document title, save time and time zone", () => {
    assert.equal(project.title, "Test house")
    assert.equal(project.savedAt, "2026-10-24 14:27:35")
    assert.equal(project.timeZone, "Europe/Vienna")
  })

  test("each peer carries its Miniserver's id and port, its own id, address and encryption", () => {
    assert.deepEqual(project.peers.map(peer => ({ ...peer, signals: undefined })), [
      { miniserverId: "server", miniserverPort: 61263, label: "nexus-dev", id: "nexus", host: "10.0.0.5", port: 61264, encrypted: false, signals: undefined },
      { miniserverId: "server", miniserverPort: 61263, label: "secure-dev", id: "secure", host: "10.0.0.6", port: 61263, encrypted: true, signals: undefined }
    ])
  })

  test("Loxone inputs become Nexus outputs and vice versa; a missing type is digital", () => {
    assert.deepEqual(project.peers[0]!.signals, [
      { packetId: "pvpower", direction: "out", dataType: 1, label: "PV power", description: "from the inverter" },
      { packetId: "door", direction: "out", dataType: 0, label: "Door" },
      { packetId: "lkitchen", direction: "in", dataType: 4, label: "Kitchen light" },
      { packetId: "trash", direction: "in", dataType: 2, label: "Trash day" }
    ])
  })

  test("decodes entities, skips objects without a packet id and those outside a peer", () => {
    assert.deepEqual(project.peers[1]!.signals, [{ packetId: "temp", direction: "in", dataType: 1, label: "Temperature & humidity" }])
    assert.ok(project.peers.every(peer => peer.signals.every(signal => signal.packetId !== "stray")))
  })

  test("garbled numbers don't become NaN: ports fall back to 0, a data type to -1", () => {
    const parsed = IntercomProjectParser.parse("<C Type=\"LanInt\" MId=\"ms\" Pt=\"x\"><C Type=\"HItcDev\" sid=\"n\" dP=\"-5\"><C Type=\"HItcOut\" pid=\"p\" tp=\"1.5\"/></C></C>")
    const peer = parsed.peers[0]!
    assert.deepEqual([peer.miniserverPort, peer.port, peer.signals[0]!.dataType], [0, 0, -1])
  })

  test("a project without intercommunication has no peers", () => {
    assert.deepEqual(IntercomProjectParser.parse("<ControlList><C Type=\"Document\" Title=\"Empty\"/></ControlList>"), { title: "Empty", peers: [] })
  })

  test("throws for XML that isn't well-formed", () => {
    assert.throws(() => IntercomProjectParser.parse("<ControlList><C Type=\"Document\">"))
  })
})
