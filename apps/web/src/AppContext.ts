import { inject, type InjectionKey } from "vue"
import { AuthApi } from "./api/AuthApi.ts"
import { BackupApi } from "./api/BackupApi.ts"
import { BusApi } from "./api/BusApi.ts"
import { ConfigApi } from "./api/ConfigApi.ts"
import { DiagnosticsApi } from "./api/DiagnosticsApi.ts"
import { HistoryApi } from "./api/HistoryApi.ts"
import { Http } from "./api/Http.ts"
import { MiniserverApi } from "./api/MiniserverApi.ts"
import { PluginApi } from "./api/PluginApi.ts"
import { PluginPackageApi } from "./api/PluginPackageApi.ts"
import { StreamConnection, type StreamHandlers } from "./api/StreamConnection.ts"
import { WireApi } from "./api/WireApi.ts"
import { SelectionApi } from "./api/SelectionApi.ts"
import { RecordedSignals } from "./stores/RecordedSignals.ts"
import { WiredSignals } from "./stores/WiredSignals.ts"
import { SessionStore } from "./stores/SessionStore.ts"

/** Everything views need, built once in main.ts and provided to the component tree (no module globals). */
export class AppContext {
  readonly http = new Http()
  readonly auth = new AuthApi(this.http)
  readonly miniservers = new MiniserverApi(this.http)
  readonly bus = new BusApi(this.http)
  readonly config = new ConfigApi(this.http)
  readonly plugins = new PluginApi(this.http)
  readonly pluginPackages = new PluginPackageApi(this.http)
  readonly wires = new WireApi(this.http)
  readonly history = new HistoryApi(this.http)
  readonly selections = new SelectionApi(this.http)
  readonly diagnostics = new DiagnosticsApi(this.http)
  readonly backup = new BackupApi(this.http)
  /** which signals the history records, shared by the signal lists */
  readonly recorded = new RecordedSignals(this.history)
  readonly wired = new WiredSignals(this.wires)
  readonly session = new SessionStore(this.auth)
  /** set by main.ts once the router exists: forget the user and go to the login page */
  onSessionEnded: () => void = () => {}

  /** a live stream connection that reports an ended session to onSessionEnded */
  stream(handlers: Omit<StreamHandlers, "onSessionEnded">) {
    return new StreamConnection({ ...handlers, onSessionEnded: () => this.onSessionEnded() })
  }

  static readonly KEY: InjectionKey<AppContext> = Symbol("AppContext")

  /** for components; throws when used outside the app (e.g. a test that forgot to provide it) */
  static use(): AppContext {
    const context = inject(AppContext.KEY)
    if (!context) throw new Error("AppContext is not provided")
    return context
  }
}
