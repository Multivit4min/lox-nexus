import assert from "node:assert/strict"
import { createSocket, type Socket } from "node:dgram"
import { after, before, test } from "node:test"
import { DnsPacket } from "./DnsPacket.ts"
import { TestClock } from "../testing/TestClock.ts"
import { Mdns } from "./Mdns.ts"

// builds an answer the way responders do: PTR to the instance, SRV, TXT and A in the same packet
function record(name: Buffer, type: number, data: Buffer) {
  const head = Buffer.alloc(10)
  head.writeUInt16BE(type, 0)
  head.writeUInt16BE(1, 2)
  head.writeUInt32BE(120, 4)
  head.writeUInt16BE(data.length, 8)
  return Buffer.concat([name, head, data])
}

function answer() {
  const type = DnsPacket.encodeName("_home-assistant._tcp.local")
  const instance = DnsPacket.encodeName("Home._home-assistant._tcp.local")
  const host = DnsPacket.encodeName("homeassistant.local")
  const srv = Buffer.concat([Buffer.from([0, 0, 0, 0, 0x1f, 0xbb]), host])
  const txt = Buffer.concat(["Base_URL=http://192.0.2.10:8123", "version=2026.10", "version=old"].map(text => Buffer.concat([Buffer.from([text.length]), Buffer.from(text)])))
  const header = Buffer.alloc(12)
  header.writeUInt16BE(0x8400, 2)
  header.writeUInt16BE(1, 6)
  header.writeUInt16BE(3, 10)
  const records = [record(type, 12, instance), record(instance, 33, srv), record(instance, 16, txt)]
  return Buffer.concat([header, ...records, record(host, 1, Buffer.from([192, 0, 2, 10]))])
}

let responder: Socket
let port = 0
const questions: string[] = []

before(async () => {
  responder = createSocket("udp4")
  responder.on("message", (packet, from) => {
    questions.push(packet.subarray(12).toString("latin1"))
    responder.send(answer(), from.port, from.address)
  })
  await new Promise<void>(resolve => responder.bind(0, "127.0.0.1", resolve))
  port = responder.address().port
})
after(() => responder.close())

test("browse asks for the type's PTR records and returns each instance with host, port, addresses and TXT", async () => {
  const found = await Mdns.browse("_home-assistant._tcp", { address: "127.0.0.1", port, timeoutMs: 300 })
  assert.deepEqual(found, [{
    name: "Home._home-assistant._tcp.local", host: "homeassistant.local", port: 8123, addresses: ["192.0.2.10"],
    txt: { base_url: "http://192.0.2.10:8123", version: "2026.10" }
  }])
  assert.match(questions[0]!, /_home-assistant/)
})

test("names with compression pointers are read; a broken packet throws, a foreign type is skipped", () => {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(1, 6)
  const name = DnsPacket.encodeName("x.local")
  // PTR whose target is "a" followed by a pointer to "x.local" at offset 12
  const ptr = record(name, 12, Buffer.from([1, 0x61, 0xc0, 12]))
  assert.deepEqual(DnsPacket.records(Buffer.concat([header, ptr])), [{ type: "PTR", name: "x.local", target: "a.x.local" }])
  const loop = Buffer.concat([header, record(Buffer.from([0xc0, 12]), 12, Buffer.from([0]))])
  assert.throws(() => DnsPacket.records(loop), /loop/)
  assert.deepEqual(DnsPacket.records(Buffer.concat([header, record(name, 99, Buffer.from([1, 2]))])), [])
})

test("nothing answering gives an empty list", async () => {
  const silent = createSocket("udp4")
  await new Promise<void>(resolve => silent.bind(0, "127.0.0.1", resolve))
  assert.deepEqual(await Mdns.browse("_x._tcp.local", { address: "127.0.0.1", port: silent.address().port, timeoutMs: 100 }), [])
  silent.close()
})

test("short address records and names past their record are refused", () => {
  const header = Buffer.alloc(12)
  header.writeUInt16BE(1, 6)
  const name = DnsPacket.encodeName("x.local")
  assert.throws(() => DnsPacket.records(Buffer.concat([header, record(name, 1, Buffer.from([192, 0]))])), /A record has 2 bytes/)
  // a PTR whose data holds one byte of a longer name
  const ptr = Buffer.concat([header, record(name, 12, Buffer.from([5])), Buffer.from("abcde\0")])
  assert.throws(() => DnsPacket.records(ptr), /past/)
})

test("a query that can't be sent rejects once and leaves nothing running", async () => {
  const clock = new TestClock()
  await assert.rejects(Mdns.browse("_x._tcp.local", { address: "nonexistent.invalid", timeoutMs: 100, clock }))
  assert.equal(clock.pending, 0)
})
