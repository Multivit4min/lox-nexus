import type { ConfigExport, ConfigImportResultDto, LoxoneSignalInput } from "@lox-nexus/api"
import { SignalDisplays } from "@lox-nexus/core"
import type { ConfigDocument } from "./ConfigCheck.ts"
import type { LoxoneSignalService } from "./LoxoneSignalService.ts"
import type { MiniserverService } from "./MiniserverService.ts"

type Step = (where: string, work: () => unknown) => Promise<boolean>

/** The Miniservers of a config export and their signals; passwords stay on the server. */
export class MiniserverTransfer {
  constructor(
    private readonly miniservers: Pick<MiniserverService, "list" | "require" | "create" | "remove">,
    private readonly signals: Pick<LoxoneSignalService, "list" | "add">
  ) {}

  export(): ConfigExport["miniservers"] {
    return this.miniservers.list().map(ms => ({
      id: ms.id, slug: ms.slug, label: ms.label, host: ms.host, port: ms.port, listenPort: ms.listenPort,
      ...(ms.listenAddress === undefined ? {} : { listenAddress: ms.listenAddress }),
      ownId: ms.ownId, remoteId: ms.remoteId, enabled: ms.enabled, resendInterval: ms.resendInterval,
      // the DTO types dataType as a number; the schema checks it when the file is read back
      signals: this.signals.list(ms.id).map(({ id, packetId, direction, dataType, label, slug, ...display }) => ({
        id, packetId, direction, dataType: dataType as LoxoneSignalInput["dataType"], label, ...(slug === undefined ? {} : { slug }),
        ...SignalDisplays.of(display)
      }))
    }))
  }

  /** the stored passwords by Miniserver id: an import gives them back to the same ids */
  passwords() {
    const stored = new Map<string, string>()
    for (const { id } of this.miniservers.list()) {
      const password = this.miniservers.require(id).config.password
      if (password !== undefined) stored.set(id, password)
    }
    return stored
  }

  /** removing a Miniserver also removes its signals and, through them, their wires */
  async clear(by: string, step: Step) {
    for (const ms of this.miniservers.list()) await step(`removing miniserver "${ms.id}"`, () => this.miniservers.remove(ms.id, by))
  }

  /** creates the file's Miniservers with their signals, counting into `result` */
  async apply(doc: ConfigDocument, passwords: Map<string, string>, step: Step, result: ConfigImportResultDto) {
    for (const [i, { id, signals: list, ...input }] of doc.miniservers.entries()) {
      const password = passwords.get(id)
      if (!await step(`miniservers[${i}]`, () => this.miniservers.create({ ...input, ...(password ? { password } : {}) }, id))) continue
      result.miniservers++
      if (password) result.keptPasswords.push(id)
      for (const [j, { id: signalId, ...signal }] of list.entries()) {
        if (await step(`miniservers[${i}].signals[${j}]`, () => this.signals.add(id, signal, signalId))) result.signals++
      }
    }
  }
}
