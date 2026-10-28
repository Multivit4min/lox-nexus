import assert from "node:assert/strict"
import { beforeEach, describe, test } from "node:test"
import type { MiniserverDto, MiniserverInput } from "@lox-nexus/api"
import { DomainError } from "@lox-nexus/core"
import { HttpError } from "../http/HttpError.ts"
import { LoggerFactory } from "../logging/LoggerFactory.ts"
import type { ConfigDocument } from "./ConfigCheck.ts"
import { ConfigTransfer, type ConfigServices } from "./ConfigTransfer.ts"

/** Miniservers in memory; ids in failCreate/failRemove/failAdd throw, `gate` holds create until opened. */
class FakeServices {
  readonly stored = new Map<string, MiniserverDto>()
  readonly failCreate = new Set<string>()
  readonly failRemove = new Set<string>()
  failAdd: unknown
  gate: Promise<void> | undefined

  readonly services: ConfigServices = {
    miniservers: {
      list: () => [...this.stored.values()],
      require: () => ({ config: {} }) as never,
      create: async (input: MiniserverInput, id = "generated") => {
        await this.gate
        if (this.failCreate.has(id)) throw new Error(`miniserver "${id}" refused`)
        const dto = { ...input, id, hasPassword: false, running: false, health: "stopped", load: 0 } as MiniserverDto
        this.stored.set(id, dto)
        return dto
      },
      remove: async (id: string) => {
        if (this.failRemove.has(id)) throw new Error(`miniserver "${id}" can't be removed`)
        this.stored.delete(id)
      }
    },
    signals: {
      list: () => [],
      add: () => {
        if (this.failAdd) throw this.failAdd
        return {} as never
      }
    },
    wires: { list: () => [], restore: () => true }
  }
}

const miniserver = (id: string, signals: ConfigDocument["miniservers"][number]["signals"] = []) => ({
  id, slug: id, label: id, host: "h", port: 1, listenPort: 2, ownId: "a", remoteId: "b", enabled: false, resendInterval: 0, signals
})
const doc = (...miniservers: ConfigDocument["miniservers"]): ConfigDocument => ({ format: "lox-nexus/config", version: 1, miniservers, wires: [] })
const signal = { id: "s", packetId: "p", direction: "in" as const, dataType: 1 as const, label: "" }

describe("ConfigTransfer failure handling", () => {
  let fake: FakeServices
  let transfer: ConfigTransfer

  beforeEach(async () => {
    fake = new FakeServices()
    transfer = new ConfigTransfer(fake.services, LoggerFactory.silent())
    await fake.services.miniservers.create(miniserver("old"), "old")
  })

  test("a second import while one runs is refused", async () => {
    let open = () => {}
    fake.gate = new Promise(resolve => (open = resolve))
    const first = transfer.import(doc(miniserver("new")), "t")
    await assert.rejects(transfer.import(doc(miniserver("other")), "t"), (error: HttpError) => error.status === 409)
    open()
    await first
    assert.deepEqual([...fake.stored.keys()], ["new"])
  })

  test("a failed step restores the backup, even if clearing for the restore fails", async () => {
    fake.failAdd = new DomainError("packet-id-taken", "packet id taken")
    fake.failRemove.add("new")
    await assert.rejects(transfer.import(doc(miniserver("new", [signal])), "t"), (error: HttpError) =>
      error.status === 409 && error.message === "miniservers[0].signals[0]: packet id taken")
    assert.ok(fake.stored.has("old"), "the backup came back although removing the half import failed")
  })

  test("a restore that can't bring everything back is a 500", async () => {
    fake.failCreate.add("new").add("old")
    await assert.rejects(transfer.import(doc(miniserver("new")), "t"), (error: HttpError) =>
      error.status === 500 && /could not be restored completely/.test(error.message))
    // a later import still runs: the flag was reset
    fake.failCreate.clear()
    assert.equal((await transfer.import(doc(miniserver("again")), "t")).miniservers, 1)
  })

  test("SQL never reaches the client; unexpected errors stay as they are", async () => {
    fake.failAdd = Object.assign(new Error("UNIQUE constraint failed: loxone_signals.packet_id"), { errcode: 2067 })
    await assert.rejects(transfer.import(doc(miniserver("new", [signal])), "t"), (error: HttpError) =>
      error.message === "miniservers[0].signals[0]: conflicts with other data in the file")
    fake.failAdd = new TypeError("a bug")
    await assert.rejects(transfer.import(doc(miniserver("new", [signal])), "t"), TypeError)
  })
})
