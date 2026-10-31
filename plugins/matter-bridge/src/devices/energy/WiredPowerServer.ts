import { PowerSourceServer } from "@matter/main/behaviors/power-source"
import { PowerSource } from "@matter/main/clusters/power-source"

const Base = PowerSourceServer.with("Wired")

/** Mains power (AC), the power source Matter's energy device types require. */
export class WiredPowerServer extends Base {
  static override readonly State = class extends Base.State {
    override status = PowerSource.PowerSourceStatus.Active
    override order = 0
    override description = "Mains"
    override wiredCurrentType = PowerSource.WiredCurrentType.Ac
  }
}
