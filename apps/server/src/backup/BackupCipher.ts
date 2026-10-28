import { createCipheriv, createDecipheriv, randomBytes, scrypt, type DecipherGCM } from "node:crypto"
import { Transform, type TransformCallback } from "node:stream"

/**
 * The encryption of a backup file: AES-256-GCM with a key derived from the passphrase (scrypt).
 * Layout: MAGIC, the scrypt cost (log2 N, one byte, so it can be raised without a new format),
 * salt, iv, ciphertext, 16-byte tag. Salt and iv are new per file, so a key and nonce never repeat.
 * The tag covers everything, also the header, so a wrong passphrase or a damaged file is certain
 * only once the whole file was read; until then nothing may be used. (GCM allows about 64 GiB per
 * key and nonce, far beyond a backup.)
 */
export class BackupCipher {
  static readonly MAGIC = Buffer.from("LOXNEXUS-BACKUP1")
  static readonly HEADER = BackupCipher.MAGIC.length + 1 + 16 + 12
  private static readonly TAG = 16
  /** 2^17 x 128 x 8 bytes = 128 MiB per derivation: the file can be attacked offline, so make each guess expensive */
  static readonly LOG_N = 17
  private static readonly LOG_N_RANGE = [14, 20] as const

  static key(passphrase: string, salt: Buffer, logN = BackupCipher.LOG_N) {
    const params = { N: 2 ** logN, r: 8, p: 1, maxmem: 2 * 128 * 8 * 2 ** logN }
    return new Promise<Buffer>((resolve, reject) =>
      scrypt(passphrase.normalize("NFC"), salt, 32, params, (error, key) => (error ? reject(error) : resolve(key))))
  }

  /** a stream that writes the header first, then encrypts what passes, then appends the tag */
  static async encrypt(passphrase: string): Promise<Transform> {
    const salt = randomBytes(16)
    const iv = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", await BackupCipher.key(passphrase, salt), iv)
    const header = Buffer.concat([BackupCipher.MAGIC, Buffer.from([BackupCipher.LOG_N]), salt, iv])
    cipher.setAAD(header)
    let started = false
    return new Transform({
      transform(chunk: Buffer, _encoding, done: TransformCallback) {
        if (!started) this.push(header)
        started = true
        done(null, cipher.update(chunk))
      },
      flush(done: TransformCallback) {
        if (!started) this.push(header)
        done(null, Buffer.concat([cipher.final(), cipher.getAuthTag()]))
      }
    })
  }

  /**
   * A stream that reads the header, decrypts the rest and checks the tag at the end; the stream
   * fails (WrongPassphraseError) when the passphrase is wrong or the file was changed.
   */
  static decrypt(passphrase: string): Transform {
    let head = Buffer.alloc(0)
    let tail = Buffer.alloc(0)
    let decipher: DecipherGCM | undefined
    let opening: Promise<void> | undefined
    const open = async () => {
      decipher = await BackupCipher.decipher(head, passphrase)
    }
    return new Transform({
      async transform(chunk: Buffer, _encoding, done: TransformCallback) {
        try {
          if (!decipher) {
            head = Buffer.concat([head, chunk])
            if (head.length < BackupCipher.HEADER) return done()
            chunk = head.subarray(BackupCipher.HEADER)
            await (opening ??= open())
          }
          // the last 16 bytes are the tag, so they are held back until the end
          tail = Buffer.concat([tail, chunk])
          const ready = tail.subarray(0, Math.max(0, tail.length - BackupCipher.TAG))
          tail = tail.subarray(ready.length)
          done(null, decipher!.update(ready))
        } catch (error) {
          done(error as Error)
        }
      },
      flush(done: TransformCallback) {
        try {
          if (!decipher || tail.length !== BackupCipher.TAG) throw new NotABackupError()
          decipher.setAuthTag(tail)
          done(null, decipher.final())
        } catch (error) {
          done(error instanceof NotABackupError ? error : new WrongPassphraseError())
        }
      }
    })
  }

  // reads the header: MAGIC, scrypt cost, salt, iv; the header is authenticated with the rest
  private static async decipher(head: Buffer, passphrase: string): Promise<DecipherGCM> {
    const at = BackupCipher.MAGIC.length
    if (!head.subarray(0, at).equals(BackupCipher.MAGIC)) throw new NotABackupError()
    const logN = head[at]!
    const [low, high] = BackupCipher.LOG_N_RANGE
    if (logN < low || logN > high) throw new NotABackupError()
    const salt = head.subarray(at + 1, at + 17)
    const decipher = createDecipheriv("aes-256-gcm", await BackupCipher.key(passphrase, salt, logN), head.subarray(at + 17, BackupCipher.HEADER))
    decipher.setAAD(head.subarray(0, BackupCipher.HEADER))
    return decipher
  }
}

/** The file doesn't start like a backup of Nexus, or ends too early. */
export class NotABackupError extends Error {
  constructor() {
    super("this is not a Lox Nexus backup, or it is incomplete")
  }
}

/** The tag didn't match: the passphrase is wrong, or the file was changed. */
export class WrongPassphraseError extends Error {
  constructor() {
    super("the passphrase is wrong, or the file was changed or damaged")
  }
}
