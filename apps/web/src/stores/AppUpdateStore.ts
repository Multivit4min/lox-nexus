import type { AppUpdateDto } from "@lox-nexus/api"
import { reactive } from "vue"
import type { SystemUpdateApi } from "../api/SystemUpdateApi.ts"

/**
 * Whether a newer Nexus is out, shared by the user menu (a dot on System) and the System page.
 * The shell loads it after login and every hour while the tab is visible, the System page on
 * opening; this only reads what the server stored, it never makes the server ask GitHub.
 */
export class AppUpdateStore {
  readonly state = reactive<{ update?: AppUpdateDto; checking: boolean; failure?: string; loadFailure?: string }>({ checking: false })
  private loading: Promise<void> | undefined

  constructor(private readonly api: Pick<SystemUpdateApi, "get" | "check" | "setEnabled">) {}

  get available() {
    return this.state.update?.available
  }

  /** calls at the same time share one request; a failure is kept for the System page, and the next call tries again */
  load() {
    this.loading ??= this.api.get().then(update => {
      this.state.update = update
      this.state.loadFailure = undefined
    }, (error: unknown) => {
      this.state.loadFailure = error instanceof Error ? error.message : String(error)
    }).finally(() => (this.loading = undefined))
    return this.loading
  }

  async check() {
    this.state.checking = true
    try {
      this.state.update = await this.api.check()
      this.state.failure = undefined
    } catch (error) {
      this.state.failure = error instanceof Error ? error.message : String(error)
    } finally {
      this.state.checking = false
    }
  }

  async setEnabled(enabled: boolean) {
    try {
      this.state.update = await this.api.setEnabled(enabled)
      this.state.failure = undefined
    } catch (error) {
      this.state.failure = error instanceof Error ? error.message : String(error)
    }
  }
}
