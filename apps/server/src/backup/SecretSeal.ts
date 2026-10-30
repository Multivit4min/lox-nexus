import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import type { SealedSecretsSchema } from "@lox-nexus/api"
import type { z } from "zod"
import { BackupCipher, WrongPassphraseError } from "./BackupCipher.ts"

type Sealed = z.infer<typeof SealedSecretsSchema>

/**
 * Plugin secrets in a config export, sealed with the user's passphrase like a backup: AES-256-GCM
 * with a key from scrypt, a new salt and iv each time. The file can be attacked offline, so the
 * passphrase needs some length (the API asks for 12 characters) and each guess costs 128 MiB.
 */
export class SecretSeal {
  static readonly TAG_BYTES = 16

  static async seal(value: unknown, passphrase: string): Promise<Sealed> {
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", await BackupCipher.key(passphrase, salt), iv)
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
    return { logN: BackupCipher.LOG_N, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") }
  }

  /** @throws WrongPassphraseError for a wrong passphrase or a changed or malformed sealed part */
  static async open(sealed: Sealed, passphrase: string): Promise<unknown> {
    const [salt, iv, tag] = [sealed.salt, sealed.iv, sealed.tag].map(part => Buffer.from(part, "base64"))
    // a cut tag would weaken the check; a wrong length is a changed file, not a server error
    if (salt!.length !== 16 || iv!.length !== 12 || tag!.length !== SecretSeal.TAG_BYTES) throw new WrongPassphraseError()
    const key = await BackupCipher.key(passphrase, salt!, sealed.logN)
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv!, { authTagLength: SecretSeal.TAG_BYTES })
      decipher.setAuthTag(tag!)
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString("utf8")) as unknown
    } catch {
      throw new WrongPassphraseError()
    }
  }
}
