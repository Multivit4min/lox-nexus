import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ProjectFixtures } from "../test-support/ProjectFixtures.ts"
import { LoxCcDecoder } from "./LoxCcDecoder.ts"
import { MiniserverFtp } from "./MiniserverFtp.ts"
import { ProjectFiles } from "./ProjectFiles.ts"
import { ProjectReadError } from "./ProjectReadError.ts"
import { ProjectReader } from "./ProjectReader.ts"

const source = (name: string, data: Uint8Array) => ({ download: () => Promise.resolve({ name, data: Buffer.from(data) }) })

describe("ProjectFiles.newest", () => {
  test("picks the latest save time, then the higher config version; ignores other files", () => {
    assert.equal(ProjectFiles.newest([
      "sps_0274_20261023133320.zip", "sps_0274_20261024142743.zip", "sps_0273_20260828123416.zip",
      "Default.Loxone", "Emergency.LoxCC", "Music.json", "permissions.bin"
    ]), "sps_0274_20261024142743.zip")
    assert.equal(ProjectFiles.newest(["sps_0009.LoxCC", "sps_0010.LoxCC"]), "sps_0010.LoxCC")
    assert.equal(ProjectFiles.newest(["Default.Loxone"]), undefined)
  })
})

/** a zip whose central directory claims `size` bytes for sps0.LoxCC, as a zip bomb would */
function claiming(size: number) {
  const zip = Buffer.from(ProjectFixtures.zip())
  for (let at = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); at >= 0; at = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), at + 4)) {
    if (zip.subarray(at + 46, at + 46 + zip.readUInt16LE(at + 28)).toString() === "sps0.LoxCC") zip.writeUInt32LE(size, at + 24)
  }
  return zip
}

describe("ProjectReader", () => {
  test("reads the project out of a Miniserver's zip", async () => {
    const read = await new ProjectReader(source("sps_0274_20261024142743.zip", ProjectFixtures.zip())).read("ms", { username: "u", password: "p" })
    assert.equal(read.file, "sps_0274_20261024142743.zip")
    assert.deepEqual(read.project.peers.map(peer => peer.id), ["nexus", "secure"])
  })

  test("reads a bare .LoxCC", async () => {
    const read = await new ProjectReader(source("sps_0010.LoxCC", ProjectFixtures.loxcc(Buffer.from(ProjectFixtures.XML)))).read("ms", { username: "u", password: "p" })
    assert.equal(read.project.title, "Test house")
  })

  test("a zip without the project, a corrupt file or broken XML is a ProjectReadError naming the file", async () => {
    const cases: Array<[Uint8Array, RegExp]> = [
      [ProjectFixtures.zip().subarray(0, 0), /sps_1_20260101000000\.zip/],
      [Buffer.from("not a zip"), /can't be read/],
      [ProjectFixtures.zip("<ControlList>"), /not a readable project/],
      [claiming(LoxCcDecoder.MAX_OUTPUT_BYTES + 1), /sps0\.LoxCC is \d+ bytes, more than allowed/]
    ]
    for (const [data, message] of cases) {
      await assert.rejects(new ProjectReader(source("sps_1_20260101000000.zip", data)).read("ms", { username: "u", password: "p" }),
        (error: unknown) => error instanceof ProjectReadError && message.test(error.message))
    }
  })
})

/** the fixture zip with its sps0.LoxCC directory record repeated `times` times, all pointing at one entry */
function repeating(times: number) {
  const zip = Buffer.from(ProjectFixtures.zip())
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const [count, size, offset] = [zip.readUInt16LE(end + 10), zip.readUInt32LE(end + 12), zip.readUInt32LE(end + 16)]
  const directory = zip.subarray(offset, offset + size)
  const records: Buffer[] = []
  for (let at = 0; at < directory.length;) {
    const length = 46 + directory.readUInt16LE(at + 28) + directory.readUInt16LE(at + 30) + directory.readUInt16LE(at + 32)
    const record = directory.subarray(at, at + length)
    const named = record.subarray(46, 46 + record.readUInt16LE(28)).toString() === "sps0.LoxCC"
    for (let i = 0; i < (named ? times : 1); i++) records.push(record)
    at += length
  }
  const newDirectory = Buffer.concat(records)
  const tail = Buffer.from(zip.subarray(end))
  tail.writeUInt16LE(count + times - 1, 8)
  tail.writeUInt16LE(count + times - 1, 10)
  tail.writeUInt32LE(newDirectory.length, 12)
  return Buffer.concat([zip.subarray(0, offset), newDirectory, tail])
}

describe("ProjectReader.file: a project file the user picked", () => {
  const reader = new ProjectReader(source("unused", new Uint8Array()))

  test("is recognised by its content: a .Loxone (XML), a Miniserver archive or a .LoxCC, whatever its name", () => {
    const files: Array<[string, Uint8Array]> = [
      ["Haus.Loxone", Buffer.from(ProjectFixtures.XML)],
      ["download.bin", ProjectFixtures.zip()],
      ["sps0.LoxCC", ProjectFixtures.loxcc(Buffer.from(ProjectFixtures.XML))],
      ["spaced.Loxone", Buffer.from(`\n  ${ProjectFixtures.XML.slice(1)}`)]
    ]
    for (const [name, data] of files) {
      const read = reader.file(name, data)
      assert.deepEqual([read.file, read.project.title, read.project.peers.length], [name, "Test house", 2], name)
    }
  })

  test("anything else, or a corrupt archive, is a ProjectReadError naming the file", () => {
    const cases: Array<[Uint8Array, RegExp]> = [
      [Buffer.from("just text"), /"picked" is not a Loxone Config project/],
      [new Uint8Array(), /"picked" is not a Loxone Config project/],
      [ProjectFixtures.zip().subarray(0, 40), /"picked" can't be read/],
      [Buffer.from("<ControlList>"), /"picked" is not a readable project/],
      [Buffer.from([0xff, 0xfe, 0x3c, 0x00]), /"picked" is UTF-16/],
      [repeating(2), /the archive has more than one sps0\.LoxCC/]
    ]
    for (const [data, message] of cases) {
      assert.throws(() => reader.file("picked", data), (error: unknown) => error instanceof ProjectReadError && message.test(error.message))
    }
  })
})

/**
 * Against the real test Miniserver (see .env); skipped unless LOXONE_TEST_HOST, LOXONE_TEST_USER
 * and LOXONE_TEST_PASSWORD are set. Read-only: it lists /prog and downloads one file. No wrong-login
 * test: the Miniserver blocks an address after failed logins.
 */
describe("ProjectReader against a real Miniserver", () => {
  const { LOXONE_TEST_HOST: host, LOXONE_TEST_USER: username, LOXONE_TEST_PASSWORD: password } = process.env
  const skip = host && username && password ? false : "set LOXONE_TEST_HOST, LOXONE_TEST_USER and LOXONE_TEST_PASSWORD"

  test("downloads and parses the current project", { skip, timeout: 60_000 }, async () => {
    const read = await new ProjectReader(new MiniserverFtp()).read(host!, { username: username!, password: password! })
    assert.match(read.file, /^sps_\d+/)
    assert.ok(read.project.peers.length > 0)
  })
})
