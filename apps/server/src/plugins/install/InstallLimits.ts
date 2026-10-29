const MIB = 1024 * 1024

/** Every cap and timeout of the installer in one place; tests lower single values. */
export class InstallLimits {
  /** entries in a ZIP */
  readonly entries: number = 5_000
  /** sum of the uncompressed sizes a ZIP declares */
  readonly unpackedBytes: number = 50 * MIB
  /** the uploaded archive itself */
  readonly uploadBytes: number = 50 * MIB
  /** the plugin's bundle (its entry), and its source map */
  readonly bundleBytes: number = 20 * MIB
  /** package.json */
  readonly manifestBytes: number = 256 * 1024
  /** README.md; a larger one is left out, the install goes on */
  readonly readmeBytes: number = 512 * 1024
  /** a name inside a ZIP */
  readonly nameLength: number = 512
  /** what a git clone may download */
  readonly gitStoreBytes: number = 100 * MIB
  readonly gitTimeoutMs: number = 120_000
  /** how long a checked install waits for its confirmation */
  readonly pendingMs: number = 15 * 60_000
  /** the throwaway describe worker: until hello, and until the description */
  readonly describeMs: number = 10_000

  constructor(overrides: Partial<InstallLimits> = {}) {
    Object.assign(this, overrides)
  }
}
