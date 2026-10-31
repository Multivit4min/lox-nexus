import { Action, z } from "@lox-nexus/plugin-sdk"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { Vouchers } from "../vouchers/Vouchers.ts"

const input = z.object({
  code: z.string().regex(Vouchers.CODE_PATTERN, "letters, digits and dashes").meta({ title: "Code", description: "The voucher's code as List vouchers shows it" })
})

/** Deletes a voucher by its code; guests using it lose access. */
export class DeleteVoucherAction extends Action<UnifiPlugin, z.infer<typeof input>> {
  static readonly id = "delete-voucher"
  static readonly label = "Delete voucher"
  static readonly description = "Deletes a hotspot voucher; guests using it lose their access"
  static readonly input = input
  static readonly confirm = "Delete this voucher? Guests using it lose their access."

  async run() {
    const deleted = await this.plugin.vouchers.delete(this.input.code)
    // failures are logged by the host, so no message here names the code
    if (deleted === 0) throw new Error("no voucher has this code")
    this.plugin.log.info(`deleted ${deleted} voucher${deleted === 1 ? "" : "s"} from the panel`)
    return `Deleted ${deleted} voucher${deleted === 1 ? "" : "s"}`
  }
}
