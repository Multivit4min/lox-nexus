import { SaxesParser, type SaxesTagPlain } from "saxes"
import type { IntercomPeer, IntercomProject, IntercomProjectSignal } from "./IntercomProject.ts"

/** the object types this parser reads; every other `<C>` is passed over */
const SIGNAL_DIRECTIONS: Record<string, IntercomProjectSignal["direction"]> = { HItcOut: "in", HItcIn: "out" }

/**
 * Reads the intercommunication part of a Loxone Config project (the XML in `sps0.LoxCC`):
 * `LanInt` (a Miniserver's Network Intercommunication), its `HItcDev` peers and their
 * `HItcIn`/`HItcOut` objects. Parsing is event based and keeps only those objects, so a large
 * house costs little beyond the XML string itself.
 */
export class IntercomProjectParser {
  private readonly project: IntercomProject = { title: "", peers: [] }
  /** the `Type` of every open element, so closing one tells which object ended */
  private readonly open: Array<string | undefined> = []
  private lanInt: { id: string; port: number } | undefined
  private peer: IntercomPeer | undefined

  /** @throws Error for XML that isn't well-formed */
  static parse(xml: string): IntercomProject {
    return new IntercomProjectParser().run(xml)
  }

  private run(xml: string): IntercomProject {
    const parser = new SaxesParser()
    parser.on("opentag", tag => this.enter(tag))
    parser.on("closetag", () => this.leave())
    parser.on("error", error => {
      throw error
    })
    // Loxone Config writes a byte order mark
    parser.write(xml.replace(/^\uFEFF/, "")).close()
    return this.project
  }

  private enter(tag: SaxesTagPlain) {
    const type = tag.name === "C" ? tag.attributes.Type : undefined
    this.open.push(type)
    const attr = (name: string) => tag.attributes[name]
    if (type === "Document") {
      this.project.title = attr("Title") ?? ""
      if (attr("Date")) this.project.savedAt = attr("Date")
    } else if (type === "LanInt") {
      this.lanInt = { id: attr("MId") ?? "", port: IntercomProjectParser.int(attr("Pt")) ?? 0 }
    } else if (type === "HItcDev" && this.lanInt) {
      this.peer = {
        miniserverId: this.lanInt.id, miniserverPort: this.lanInt.port, label: attr("Title") ?? "", id: attr("sid") ?? "",
        host: attr("dAd") ?? "", port: IntercomProjectParser.int(attr("dP")) ?? 0, encrypted: attr("enc") === "true", signals: []
      }
      this.project.peers.push(this.peer)
    } else if (type && this.peer) {
      this.signal(type, attr)
    }
  }

  private signal(type: string, attr: (name: string) => string | undefined) {
    const direction = SIGNAL_DIRECTIONS[type]
    const packetId = attr("pid")
    if (!direction || !packetId || !this.peer) return
    // a missing type is digital; a garbled one becomes -1, which no data type maps to
    const tp = attr("tp")
    const dataType = tp === undefined ? 0 : IntercomProjectParser.int(tp) ?? -1
    const signal: IntercomProjectSignal = { packetId, direction, dataType, label: attr("Title") ?? packetId }
    const description = attr("Desc")
    if (description) signal.description = description
    this.peer.signals.push(signal)
  }

  private static int(value: string | undefined) {
    return value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : undefined
  }

  private leave() {
    const type = this.open.pop()
    if (type === "HItcDev") this.peer = undefined
    if (type === "LanInt") this.lanInt = undefined
  }
}
