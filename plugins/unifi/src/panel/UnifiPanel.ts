import type { Panel } from "@lox-nexus/plugin-sdk"
import type { NetworkPoller } from "../poll/NetworkPoller.ts"
import { ClientsSection } from "./ClientsSection.ts"
import { ConsoleSection, type ConsoleFacts } from "./ConsoleSection.ts"
import { DevicesSection } from "./DevicesSection.ts"
import { WifiSection } from "./WifiSection.ts"

/**
 * The instance page, from what the last poll read (never a request of its own): how polling
 * goes, Wi-Fi switches, devices with Restart, switch ports with Power-cycle, and the connected
 * clients. Nothing secret: no API key, no Wi-Fi passphrase.
 */
export class UnifiPanel {
  constructor(private readonly poller: Pick<NetworkPoller, "latest" | "problem" | "lastError" | "version">, private readonly facts: ConsoleFacts) {}

  build(): Panel {
    const sections = new ConsoleSection(this.poller, this.facts).sections()
    const latest = this.poller.latest
    if (latest) {
      sections.push(...new WifiSection(latest).sections(), ...new DevicesSection(latest).sections(), ...new ClientsSection(latest).sections())
    }
    return { type: "sections", sections }
  }
}
