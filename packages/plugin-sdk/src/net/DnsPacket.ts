/** A resource record of an mDNS answer, as far as service discovery needs it. */
export type DnsRecord =
  | { type: "PTR"; name: string; target: string }
  | { type: "SRV"; name: string; port: number; target: string }
  | { type: "TXT"; name: string; entries: Record<string, string> }
  | { type: "A" | "AAAA"; name: string; address: string }

const TYPES: Record<number, DnsRecord["type"]> = { 12: "PTR", 33: "SRV", 16: "TXT", 1: "A", 28: "AAAA" }

/**
 * The few parts of DNS (RFC 1035) that mDNS service discovery uses: a PTR question, and the PTR,
 * SRV, TXT, A and AAAA records of an answer. Other records are skipped; a broken packet throws.
 */
export class DnsPacket {
  /** a standard query for the PTR records of `name`, e.g. "_home-assistant._tcp.local" */
  static query(name: string): Buffer {
    const header = Buffer.alloc(12)
    header.writeUInt16BE(1, 4)
    return Buffer.concat([header, DnsPacket.encodeName(name), Buffer.from([0, 12, 0, 1])])
  }

  /** every record of the answer, authority and additional sections */
  static records(packet: Buffer): DnsRecord[] {
    const reader = new Reader(packet)
    const questions = packet.readUInt16BE(4)
    const records = packet.readUInt16BE(6) + packet.readUInt16BE(8) + packet.readUInt16BE(10)
    reader.offset = 12
    for (let i = 0; i < questions; i++) {
      reader.name()
      reader.offset += 4
    }
    const found: DnsRecord[] = []
    for (let i = 0; i < records; i++) {
      const record = reader.record()
      if (record) found.push(record)
    }
    return found
  }

  static encodeName(name: string) {
    const labels = name.replace(/\.$/, "").split(".").map(label => {
      const bytes = Buffer.from(label, "utf8")
      if (bytes.length === 0 || bytes.length > 63) throw new Error(`invalid DNS name "${name}"`)
      return Buffer.concat([Buffer.from([bytes.length]), bytes])
    })
    return Buffer.concat([...labels, Buffer.from([0])])
  }
}

/** reads names (with compression) and records from one packet */
class Reader {
  offset = 0

  constructor(private readonly packet: Buffer) {}

  name(): string {
    const { name, end } = this.nameAt(this.offset, 0)
    this.offset = end
    return name
  }

  record(): DnsRecord | undefined {
    const name = this.name()
    const type = this.packet.readUInt16BE(this.offset)
    const length = this.packet.readUInt16BE(this.offset + 8)
    const start = this.offset + 10
    this.offset = start + length
    if (this.offset > this.packet.length) throw new Error("a DNS record runs past the end of the packet")
    const kind = TYPES[type]
    if (!kind) return undefined
    const data = this.packet.subarray(start, start + length)
    if (kind === "PTR") return { type: kind, name, target: this.nameWithin(start, this.offset) }
    if (kind === "SRV") {
      if (length < 7) throw new Error("an SRV record is too short")
      return { type: kind, name, port: data.readUInt16BE(4), target: this.nameWithin(start + 6, this.offset) }
    }
    if (kind === "TXT") return { type: kind, name, entries: Reader.txt(data) }
    if (length !== (kind === "A" ? 4 : 16)) throw new Error(`an ${kind} record has ${length} bytes`)
    return { type: kind, name, address: kind === "A" ? [...data].join(".") : Reader.ipv6(data) }
  }

  // a name in a record's data must end inside it; a pointer may still lead elsewhere in the packet
  private nameWithin(offset: number, limit: number) {
    const { name, end } = this.nameAt(offset, 0)
    if (end > limit) throw new Error("a DNS name runs past its record")
    return name
  }

  // compression pointers may chain, but never loop: at most 20 jumps
  private nameAt(offset: number, jumps: number): { name: string; end: number } {
    const labels: string[] = []
    let at = offset
    for (;;) {
      const length = this.packet[at]
      if (length === undefined) throw new Error("a DNS name runs past the end of the packet")
      if (length === 0) return { name: labels.join("."), end: at + 1 }
      if ((length & 0xc0) === 0xc0) {
        if (jumps >= 20) throw new Error("a DNS name points in a loop")
        const target = this.packet.readUInt16BE(at) & 0x3fff
        const rest = this.nameAt(target, jumps + 1).name
        return { name: [...labels, rest].filter(Boolean).join("."), end: at + 2 }
      }
      labels.push(this.packet.subarray(at + 1, at + 1 + length).toString("utf8"))
      at += 1 + length
    }
  }

  private static txt(data: Buffer) {
    // keys ignore case (RFC 6763 §6.4) and come from the network, so no prototype to collide with
    const entries: Record<string, string> = Object.create(null) as Record<string, string>
    for (let at = 0; at < data.length;) {
      const length = data[at] ?? 0
      const text = data.subarray(at + 1, at + 1 + length).toString("utf8")
      const equals = text.indexOf("=")
      const key = (equals === -1 ? text : text.slice(0, equals)).toLowerCase()
      // the first of a repeated key counts (RFC 6763 §6.4)
      if (key && !(key in entries)) entries[key] = equals === -1 ? "" : text.slice(equals + 1)
      at += 1 + length
    }
    return entries
  }

  private static ipv6(data: Buffer) {
    const groups: string[] = []
    for (let i = 0; i < 16; i += 2) groups.push(data.readUInt16BE(i).toString(16))
    return groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::")
  }
}
