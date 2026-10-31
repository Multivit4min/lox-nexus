import { Action } from "@lox-nexus/plugin-sdk"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { VoucherText } from "../vouchers/VoucherText.ts"
import { voucherInput, voucherRequest, type VoucherInput } from "./VoucherInput.ts"

/**
 * Creates one hotspot voucher and answers with its code, as text and as a QR code of the code
 * (the API names no portal URL to encode, so the code is what a phone's camera can copy).
 */
export class CreateVoucherAction extends Action<UnifiPlugin, VoucherInput> {
  static readonly id = "create-voucher"
  static readonly label = "Create voucher"
  static readonly description = "Creates a hotspot voucher for guests and shows its code"
  static readonly input = voucherInput

  async run() {
    this.progress("Creating the voucher…")
    const voucher = await this.plugin.vouchers.create(voucherRequest(this.input))
    const validity = `valid ${VoucherText.duration(voucher.timeLimitMinutes)} for ${VoucherText.guests(voucher.authorizedGuestLimit)}`
    this.plugin.log.info(`created a voucher from the panel, ${validity}`)
    this.plugin.panelChanged()
    return {
      message: `Voucher ${voucher.code}, ${validity}`,
      panel: { type: "qr" as const, data: voucher.code, caption: `Voucher code ${voucher.code}` }
    }
  }
}
