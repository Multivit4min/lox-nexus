import { CommissioningServer } from "@matter/main/node"

/**
 * matter.js's commissioning server without its console instructions: by default it logs the
 * pairing code and an ASCII-art QR code, which would land in the instance log. The panel shows
 * both instead.
 */
export class QuietCommissioningServer extends CommissioningServer {
  override initiateCommissioning() {}
}
