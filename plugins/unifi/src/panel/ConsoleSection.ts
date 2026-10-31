import type { Cell, PanelPart } from "@lox-nexus/plugin-sdk"
import type { NetworkPoller } from "../poll/NetworkPoller.ts"
import type { LastVoucher } from "../vouchers/Vouchers.ts"
import { PanelText } from "./PanelText.ts"
import type { Section } from "./PanelTypes.ts"

/** what the console section shows besides the poller's state */
export interface ConsoleFacts {
  origin: string
  certificate: string
  site: string | undefined
  voucher: LastVoucher | undefined
}

type Item = { label: string; value: Cell }

/** How polling goes, the console's version and site, and headline numbers as tiles. */
export class ConsoleSection {
  constructor(private readonly poller: Pick<NetworkPoller, "latest" | "problem" | "lastError" | "version">, private readonly facts: ConsoleFacts) {}

  sections(): Section[] {
    const sections: Section[] = []
    if (this.poller.problem !== undefined) {
      sections.push({ title: "Connection", panel: { type: "notice", tone: "error", title: "Can't read the console", text: PanelText.clip(this.poller.problem, 1000) } })
    }
    const latest = this.poller.latest
    if (latest) sections.push({ title: "Network", panel: this.tiles() })
    sections.push({ title: "Console", panel: { type: "keyValue", items: this.items() } })
    return sections
  }

  private tiles(): PanelPart {
    const latest = this.poller.latest!
    const guests = latest.clients.filter(client => client.access.type === "GUEST").length
    return {
      type: "tiles",
      tiles: [
        { label: "Clients connected", value: latest.clients.length },
        { label: "Devices online", value: latest.devicesOnline, min: 0, max: latest.devices.length, tone: latest.devicesOnline < latest.devices.length ? "warn" : "ok" },
        { label: "Guests", value: guests }
      ]
    }
  }

  private items(): Item[] {
    const latest = this.poller.latest
    const items: Item[] = [
      { label: "Reading", value: this.reading() },
      { label: "UniFi Network", value: this.poller.version ?? { text: "unknown yet", tone: "muted" } },
      { label: "Console", value: this.facts.origin },
      { label: "Certificate", value: this.facts.certificate },
      { label: "Site", value: this.facts.site ?? { text: "not found yet", tone: "muted" } },
      { label: "Last successful poll", value: latest ? { text: new Date(latest.at).toISOString(), since: latest.at } : { text: "never", tone: "muted" } }
    ]
    const error = this.poller.lastError
    // an error the console recovered from stays for reference, greyed
    if (error) items.push({ label: "Last error", value: { text: `${PanelText.clip(error.message)} (${new Date(error.at).toISOString()})`, tone: this.poller.problem ? "error" : "muted" } })
    const voucher = this.facts.voucher
    const created = PanelText.time(voucher?.createdAt)
    if (voucher) items.push({ label: "Newest voucher", value: { text: PanelText.clip(`${voucher.code} (${voucher.name})`), ...(created === undefined ? {} : { since: created }) } })
    return items
  }

  private reading(): Cell {
    if (this.poller.problem !== undefined) return { text: "failing, retrying with growing pauses", tone: "error" }
    return this.poller.latest ? { text: "ok", tone: "ok" } : { text: "waiting for the first poll", tone: "muted" }
  }
}
