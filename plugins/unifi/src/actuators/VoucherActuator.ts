import { Actuator, z, type ActuatorCommand } from "@lox-nexus/plugin-sdk"
import type { ValueOf } from "@lox-nexus/plugin-sdk/values"
import type { UnifiPlugin } from "../UnifiPlugin.ts"
import { VoucherText } from "../vouchers/VoucherText.ts"
import { PulseEdge } from "./PulseEdge.ts"

const params = z.object({
  minutes: z.number().int().min(1).max(1_000_000).default(1440).meta({ title: "Valid for (minutes)", description: "From the first guest's login; 1440 is a day" }),
  guests: z.number().int().min(1).optional().meta({ title: "Guests", description: "How many guests may use one voucher. Empty: any number" }),
  note: z.string().min(1).default("Loxone").meta({ title: "Note", description: "The voucher's note on the console" })
})

/** Creates a hotspot voucher on a pulse; its code goes to the "Newest voucher code" sensor, e.g. for a display. */
export class VoucherActuator extends Actuator<UnifiPlugin, z.infer<typeof params>, ValueOf<"boolean">> {
  static readonly id = "create-voucher"
  static readonly label = "Create voucher"
  static readonly description = "Creates a hotspot voucher on a pulse (a rising true); the code goes to the Newest voucher code sensor"
  static readonly params = params
  static readonly accepts = "boolean"
  private readonly edge = new PulseEdge()

  async run(value: ValueOf<"boolean">, command?: ActuatorCommand) {
    if (!this.edge.rises(value.value, command?.replayed)) return
    const { minutes, guests, note } = this.params
    await this.plugin.vouchers.create({ name: note, timeLimitMinutes: minutes, ...(guests === undefined ? {} : { authorizedGuestLimit: guests }) })
    // the code is a guest's credential: it goes to the sensor, not to the log
    this.plugin.log.info(`created a voucher for ${VoucherText.guests(guests)}, valid ${VoucherText.duration(minutes)}`, { signal: this.signal.label })
    this.plugin.panelChanged()
  }
}
