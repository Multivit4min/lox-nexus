import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { LoxoneProjectDto, LoxoneProjectPeerDto, LoxoneSignalDto, MiniserverDto } from "@lox-nexus/api"
import { ProjectDiff } from "./ProjectDiff.ts"

const ms = { ownId: "nexus", remoteId: "server", port: 61263, listenPort: 61263, hasPassword: false } as MiniserverDto

const peer = (overrides: Partial<LoxoneProjectPeerDto> = {}): LoxoneProjectPeerDto => ({
  miniserverId: "server", miniserverPort: 61263, label: "nexus-dev", id: "nexus", host: "10.0.0.5", port: 61263, encrypted: false, signals: [], ...overrides
})

const configured = (packetId: string, direction: "in" | "out", dataType: number) =>
  ({ id: packetId, packetId, direction, dataType, label: packetId }) as LoxoneSignalDto

describe("ProjectDiff", () => {
  test("picks the peer with this Nexus' own id, preferring the same Miniserver id, else the first", () => {
    const project = (peers: LoxoneProjectPeerDto[]) => ({ file: "f", title: "t", peers }) as LoxoneProjectDto
    const other = peer({ id: "haos" })
    const elsewhere = peer({ miniserverId: "client" })
    const mine = peer()
    assert.equal(ProjectDiff.peerFor(project([other, elsewhere, mine]), ms), mine)
    assert.equal(ProjectDiff.peerFor(project([other, elsewhere]), ms), elsewhere)
    assert.equal(ProjectDiff.peerFor(project([other]), ms), other)
    assert.equal(ProjectDiff.peerFor(project([]), ms), undefined)
  })

  test("rows match by packet id and direction; inputs come first", () => {
    const rows = ProjectDiff.rows(peer({
      signals: [
        { packetId: "pv", direction: "out", dataType: 1, label: "PV" },
        { packetId: "light", direction: "in", dataType: 4, label: "Light" },
        { packetId: "pv", direction: "in", dataType: 1, label: "PV back" },
        { packetId: "door", direction: "in", dataType: 0, label: "Door" },
        { packetId: "odd", direction: "in", dataType: 9, label: "Odd" }
      ]
    }), [configured("pv", "out", 1), configured("light", "in", 1)])
    assert.deepEqual(rows.map(row => [row.key, row.status]), [
      ["in:light", "differs"], ["in:pv", "new"], ["in:door", "new"], ["in:odd", "unsupported"], ["out:pv", "same"]
    ])
    assert.deepEqual(rows.filter(ProjectDiff.actionable).map(row => row.key), ["in:light", "in:pv", "in:door"])
    assert.equal(ProjectDiff.typeChange(rows[0]!), "Analog → Smart RGBW")
  })

  test("configured signals the project no longer has come last, as removed, and are never imported", () => {
    const rows = ProjectDiff.rows(peer({ signals: [{ packetId: "pv", direction: "out", dataType: 1, label: "PV" }] }),
      [configured("old", "in", 0), configured("pv", "out", 1), configured("gone", "out", 1), configured("pv", "in", 1)])
    assert.deepEqual(rows.map(row => [row.key, row.status]), [["out:pv", "same"], ["in:old", "removed"], ["out:gone", "removed"], ["in:pv", "removed"]])
    assert.deepEqual(ProjectDiff.removed(rows).map(row => [row.existing.id, row.signal.label, row.signal.dataType]), [["old", "old", 0], ["gone", "gone", 1], ["pv", "pv", 1]])
    assert.deepEqual(rows.filter(ProjectDiff.actionable), [])
  })

  test("a packet id listed twice in one direction gives one row, the first", () => {
    const rows = ProjectDiff.rows(peer({
      signals: [
        { packetId: "pv", direction: "in", dataType: 1, label: "first" },
        { packetId: "pv", direction: "in", dataType: 0, label: "second" },
        { packetId: "pv", direction: "out", dataType: 1, label: "other direction" }
      ]
    }), [])
    assert.deepEqual(rows.map(row => row.signal.label), ["first", "other direction"])
  })

  test("importing a new row names it as in Loxone Config; an existing one keeps label and slug and only takes the type", () => {
    const [fresh, existing, odd] = ProjectDiff.rows(peer({
      signals: [
        { packetId: "door", direction: "in", dataType: 0, label: "D".repeat(120) },
        { packetId: "light", direction: "in", dataType: 4, label: "Light in Loxone" },
        { packetId: "odd", direction: "in", dataType: 9, label: "Odd" }
      ]
    }), [{ ...configured("light", "in", 1), label: "My light", slug: "kitchen-light" }])
    assert.deepEqual(ProjectDiff.inputFor(fresh!), { packetId: "door", direction: "in", dataType: 0, label: "D".repeat(100) })
    assert.deepEqual(ProjectDiff.inputFor(existing!), { packetId: "light", direction: "in", dataType: 4, label: "My light", slug: "kitchen-light" })
    assert.throws(() => ProjectDiff.inputFor(odd!), /not supported/)
  })

  test("an existing Lumitech signal keeps the option where the project's type still allows it", () => {
    const [toRgbwIn, toDigital] = ProjectDiff.rows(peer({
      signals: [
        { packetId: "lc", direction: "in", dataType: 4, label: "Light" },
        { packetId: "dim", direction: "in", dataType: 0, label: "Dim" }
      ]
    }), [{ ...configured("lc", "in", 1), lumitech: true }, { ...configured("dim", "in", 1), lumitech: true }])
    assert.equal(ProjectDiff.inputFor(toRgbwIn!).lumitech, true, "an RGBW input still carries colour numbers")
    assert.equal(ProjectDiff.inputFor(toDigital!).lumitech, undefined, "a digital one can't")
  })

  test("an existing signal keeps its unit and decimals while it stays a number", () => {
    const [stays, toDigital] = ProjectDiff.rows(peer({
      signals: [
        { packetId: "pv", direction: "in", dataType: 1, label: "PV" },
        { packetId: "flag", direction: "in", dataType: 0, label: "Flag" }
      ]
    }), [{ ...configured("pv", "in", 1), unit: "W", decimals: 1 }, { ...configured("flag", "in", 1), unit: "W" }])
    assert.deepEqual([ProjectDiff.inputFor(stays!).unit, ProjectDiff.inputFor(stays!).decimals], ["W", 1])
    assert.equal(ProjectDiff.inputFor(toDigital!).unit, undefined, "a digital signal has no unit")
  })

  test("lists every setting the project disagrees with", () => {
    assert.deepEqual(ProjectDiff.mismatches(peer(), ms), [])
    const found = ProjectDiff.mismatches(peer({ miniserverId: "ms2", id: "other", miniserverPort: 1, port: 2, encrypted: true }), ms)
    assert.equal(found.length, 5)
    assert.match(found.join("\n"), /"ms2".*"server"[\s\S]*"other".*"nexus"[\s\S]*port 1[\s\S]*port 2[\s\S]*encrypted/)
  })
})
