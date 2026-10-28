import { InstallError } from "./InstallError.ts"

/**
 * One install, confirmation or uninstall at a time, server-wide. A second request is refused
 * rather than queued: it would act on a state the user hasn't seen.
 */
export class OperationLock {
  private held = false

  /** @throws InstallError busy while another operation runs */
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.held) throw new InstallError("busy", "another plugin install or uninstall is running; try again when it is done")
    this.held = true
    try {
      return await work()
    } finally {
      this.held = false
    }
  }
}
