import type { AuthStateDto, Credentials } from "@lox-nexus/api"
import { reactive } from "vue"
import type { AuthApi } from "../api/AuthApi.ts"

/** Who is logged in, and whether first-run setup is still needed. Reactive, so views can bind to it. */
export class SessionStore {
  readonly state = reactive<{ loaded: boolean; setupRequired: boolean; user?: AuthStateDto["user"] }>({ loaded: false, setupRequired: false })

  constructor(private readonly auth: AuthApi) {}

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

  /** after a 401: the session expired or was revoked elsewhere */
  forget() {
    this.state.user = undefined
  }

  private apply(state: AuthStateDto) {
    Object.assign(this.state, { loaded: true, setupRequired: state.setupRequired, user: state.user })
  }
}
