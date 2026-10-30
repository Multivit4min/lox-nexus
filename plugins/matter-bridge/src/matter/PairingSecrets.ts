import { randomInt } from "node:crypto"
import { z, type PluginStore } from "@lox-nexus/plugin-sdk"

/** passcodes the Matter specification forbids (§ 5.1.7.1) */
const INVALID = new Set([0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321])

const secretsSchema = z.object({
  passcode: z.number().int().min(1).max(99999998).refine(passcode => !INVALID.has(passcode)),
  discriminator: z.number().int().min(0).max(4095)
})

/** what the pairing code is made of */
export type Secrets = z.infer<typeof secretsSchema>

/**
 * The bridge's passcode and discriminator, chosen once per instance and kept in the store, like the
 * code printed on a device. matter.js would pick new ones after the factory reset that removing the
 * last controller causes, and then advertised a code that didn't match (0.18).
 */
export class PairingSecrets {
  static readonly KEY = "pairing"

  constructor(private readonly store: PluginStore) {}

  get(): Secrets {
    const saved = secretsSchema.safeParse(this.store.get(PairingSecrets.KEY))
    if (saved.success) return saved.data
    const secrets = { passcode: PairingSecrets.passcode(), discriminator: randomInt(0, 4096) }
    this.store.set(PairingSecrets.KEY, secrets)
    return secrets
  }

  static valid(value: unknown): value is Secrets {
    return secretsSchema.safeParse(value).success
  }

  private static passcode() {
    let passcode = 0
    while (INVALID.has(passcode)) passcode = randomInt(1, 99999999)
    return passcode
  }
}
