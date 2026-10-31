import { EventEmitter } from "node:events"
import { z, type Listenable, type Listener, type PluginStore } from "@lox-nexus/plugin-sdk"
import type { Voucher } from "../api/ApiSchemas.ts"
import type { NetworkApi, VoucherRequest } from "../api/NetworkApi.ts"
import type { SiteResolver } from "../poll/SiteResolver.ts"

/** the newest voucher this plugin created, kept in the store for the code sensor */
const lastVoucherSchema = z.object({ code: z.string(), name: z.string(), createdAt: z.string(), timeLimitMinutes: z.number() })

/** the newest voucher, as the store keeps it for the panel and the code sensor */
export type LastVoucher = z.infer<typeof lastVoucherSchema>

/**
 * Hotspot vouchers: create (one at a time, so the answer is one code), list and delete by code.
 * Emits "created" with the new voucher. Codes are guest credentials: they are shown to the user
 * who asked and given to the code sensor, never logged.
 */
export class Vouchers implements Listenable {
  static readonly STORE_KEY = "lastVoucher"
  /** what a code to delete may contain, so the API filter needs no quoting */
  static readonly CODE_PATTERN = /^[0-9A-Za-z-]{1,64}$/
  private readonly events = new EventEmitter()

  constructor(private readonly api: Pick<NetworkApi, "createVoucher" | "vouchers" | "deleteVouchers">, private readonly site: Pick<SiteResolver, "id">, private readonly store: PluginStore) {
    // every code sensor listens; there may be more than Node's default of 10
    this.events.setMaxListeners(0)
  }

  /** the newest voucher created here, also from an earlier run; one stored in another shape is ignored */
  get last(): LastVoucher | undefined {
    const stored = lastVoucherSchema.safeParse(this.store.get(Vouchers.STORE_KEY))
    return stored.success ? stored.data : undefined
  }

  async create(request: VoucherRequest): Promise<Voucher> {
    const result = await this.api.createVoucher(await this.site.id(), request)
    const voucher = result.vouchers[0]
    if (!voucher) throw new Error("the console created no voucher")
    const last: LastVoucher = { code: voucher.code, name: voucher.name, createdAt: voucher.createdAt, timeLimitMinutes: voucher.timeLimitMinutes }
    this.store.set(Vouchers.STORE_KEY, last)
    this.events.emit("created", last)
    return voucher
  }

  /** the vouchers that can still be used, newest first */
  async usable(): Promise<Voucher[]> {
    const vouchers = await this.api.vouchers(await this.site.id())
    return vouchers.filter(voucher => !voucher.expired).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /** @returns how many vouchers were deleted (0 when no voucher has this code) */
  async delete(code: string): Promise<number> {
    const trimmed = code.trim()
    if (!Vouchers.CODE_PATTERN.test(trimmed)) throw new Error("a voucher code has only letters, digits and dashes")
    // the API's filter syntax, as in its own examples: property.function('value')
    const result = await this.api.deleteVouchers(await this.site.id(), `code.eq('${trimmed}')`)
    return result.vouchersDeleted
  }

  on(event: "created", listener: Listener) {
    this.events.on(event, listener)
    return this
  }

  off(event: "created", listener: Listener) {
    this.events.off(event, listener)
    return this
  }
}
