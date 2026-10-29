import type { AuthStateDto, Credentials } from "@lox-nexus/api"
import { reactive } from "vue"
import type { AuthApi } from "../api/AuthApi.ts"

/** Who is logged in, and whether first-run setup is still needed. Reactive, so views can bind to it. */
export class SessionStore {
  static readonly RECHECK_MS = 1500
  readonly state = reactive<{ loaded: boolean; setupRequired: boolean; user?: AuthStateDto["user"] }>({ loaded: false, setupRequired: false })

  /** @param wait for the retry in stillLoggedIn(); tests pass one that doesn't wait */
  constructor(private readonly auth: Pick<AuthApi, "state" | "setup" | "login" | "logout">, private readonly wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))) {}

  get loggedIn() {
    return this.state.user !== undefined
  }

  /** asks the server; called once before the first navigation */
  async load() {
    this.apply(await this.auth.state())
  }

  async setup(credentials: Credentials) {
    this.apply(await this.auth.setup(credentials))
  }

  async login(credentials: Credentials) {
    this.apply(await this.auth.login(credentials))
  }

  async logout() {
    await this.auth.logout()
    this.forget()
  }

  /**
   * Whether the browser still has a session after the server ended one. Changing the password ends
   * every session and sets a new cookie on the answer, which can arrive just after the live stream
   * was closed; so a "no" is asked again once, a moment later, before it counts.
   */
  async stillLoggedIn(): Promise<boolean> {
    for (const delay of [0, SessionStore.RECHECK_MS]) {
      if (delay) await this.wait(delay)
      const state = await this.auth.state().catch(() => undefined)
      if (state?.user) {
        this.apply(state)
        return true
      }
    }
    return false
  }

  /** after a 401: the session expired or was revoked elsewhere */
  forget() {
    this.state.user = undefined
  }

  private apply(state: AuthStateDto) {
    Object.assign(this.state, { loaded: true, setupRequired: state.setupRequired, user: state.user })
  }
}
