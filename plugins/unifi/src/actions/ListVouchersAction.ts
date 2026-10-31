import { Action, type Cell } from "@lox-nexus/plugin-sdk"
import type { Voucher } from "../api/ApiSchemas.ts"
import { PanelText } from "../panel/PanelText.ts"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { VoucherText } from "../vouchers/VoucherText.ts"

/** Lists the vouchers that can still be used, as a table in the answer (vouchers aren't polled). */
export class ListVouchersAction extends Action<UnifiPlugin> {
  static readonly id = "list-vouchers"
  static readonly label = "List vouchers"
  static readonly description = "Shows the hotspot vouchers that haven't expired"

  async run() {
    const vouchers = await this.plugin.vouchers.usable()
    if (vouchers.length === 0) return "No usable vouchers"
    return {
      message: `${vouchers.length} usable voucher${vouchers.length === 1 ? "" : "s"}`,
      panel: { type: "table" as const, columns: ["Code", "Note", "Valid for", "Guests", "Expires"], rows: vouchers.map(ListVouchersAction.row) }
    }
  }

  private static row(voucher: Voucher): Cell[] {
    const used = `${voucher.authorizedGuestCount} of ${voucher.authorizedGuestLimit ?? "any"}`
    const until = PanelText.time(voucher.expiresAt)
    const expires: Cell = voucher.expiresAt ? { text: voucher.expiresAt, ...(until === undefined ? {} : { until }) } : { text: "not used yet", tone: "muted" }
    return [voucher.code, voucher.name, VoucherText.duration(voucher.timeLimitMinutes), used, expires]
  }
}
