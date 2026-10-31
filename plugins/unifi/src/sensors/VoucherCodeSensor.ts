import { Sensor } from "@lox-nexus/plugin-sdk"
import { Value } from "@lox-nexus/plugin-sdk/values"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import type { LastVoucher } from "../vouchers/Vouchers.ts"

/**
 * The code of the newest voucher created here (by the action or the actuator), for a display in
 * Loxone. Kept across restarts. It is a guest's credential and travels on the bus like any value.
 */
export class VoucherCodeSensor extends Sensor<UnifiPlugin, object> {
  static readonly id = "voucher-code"
  static readonly label = "Newest voucher code"
  static readonly description = "The code of the newest hotspot voucher created by this instance, for a display"
  static readonly valueType = "string"

  override start() {
    this.listen(this.plugin.vouchers, "created", (voucher: LastVoucher) => this.emit(Value.string(voucher.code)))
    const last = this.plugin.vouchers.last
    if (last) this.emit(Value.string(last.code))
  }
}
