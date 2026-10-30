import { z } from "zod"
import { WrongPassphraseError } from "../backup/BackupCipher.ts"
import { SecretSeal } from "../backup/SecretSeal.ts"
import { HttpError } from "../http/HttpError.ts"
import type { ConfigDocument } from "./ConfigCheck.ts"
import type { ByInstance } from "./PluginTransfer.ts"

const SecretsSchema = z.record(z.string(), z.record(z.string(), z.unknown()))

/** Opens the plugins' sealed secret settings of an import file. */
export class PluginSecrets {
  /**
   * @returns the secrets by instance id; none when the file has no sealed part
   * @throws HttpError 400 "passphrase-required" when the file has them and no passphrase came, "wrong-passphrase" when it doesn't open them
   */
  static async open(doc: ConfigDocument, passphrase: string | undefined): Promise<ByInstance> {
    if (!doc.secrets) return {}
    if (!passphrase) throw new HttpError(400, "the file holds the plugins' secret settings, sealed with a passphrase: enter it to import", "passphrase-required")
    try {
      return SecretsSchema.parse(await SecretSeal.open(doc.secrets, passphrase))
    } catch (error) {
      if (error instanceof WrongPassphraseError || error instanceof z.ZodError) {
        throw new HttpError(400, "the passphrase doesn't open the file's secret settings, or the file was changed", "wrong-passphrase")
      }
      throw error
    }
  }

  /** what the instances keep when the file doesn't bring them: the secrets stored now for the same id */
  static merge(current: ByInstance, file: ByInstance): ByInstance {
    const merged: ByInstance = { ...current }
    for (const [id, secrets] of Object.entries(file)) merged[id] = { ...merged[id], ...secrets }
    return merged
  }
}
