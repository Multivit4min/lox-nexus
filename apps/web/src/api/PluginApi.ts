import type {
  BridgeRequest, BridgeResultDto, PluginInstanceDto, PluginInstanceInput, PluginLogLineDto, PluginPackageDto, PluginSignalDto, PluginSignalInput
} from "@lox-nexus/api"
import type { CatalogNode, Panel } from "@lox-nexus/plugin-sdk/wire"
import type { Http } from "./Http.ts"

/** /api/plugins and /api/plugin-instances with their signals, catalog, panel and logs */
export class PluginApi {
  constructor(private readonly http: Http) {}

  packages() {
    return this.http.get<PluginPackageDto[]>("/api/plugins")
  }

  list() {
    return this.http.get<PluginInstanceDto[]>("/api/plugin-instances")
  }

  get(id: string) {
    return this.http.get<PluginInstanceDto>(this.url(id))
  }

  /** starts it when enabled; a plugin that refuses its config ends in state "error" */
  create(input: PluginInstanceInput) {
    return this.http.post<PluginInstanceDto>("/api/plugin-instances", input)
  }

  /** secret fields left out of `config` keep their stored value */
  update(id: string, input: PluginInstanceInput) {
    return this.http.put<PluginInstanceDto>(this.url(id), input)
  }

  remove(id: string) {
    return this.http.delete(this.url(id))
  }

  start(id: string) {
    return this.http.post<PluginInstanceDto>(`${this.url(id)}/start`)
  }

  stop(id: string) {
    return this.http.post<PluginInstanceDto>(`${this.url(id)}/stop`)
  }

  signals(id: string) {
    return this.http.get<PluginSignalDto[]>(`${this.url(id)}/signals`)
  }

  addSignal(id: string, input: PluginSignalInput) {
    return this.http.post<PluginSignalDto>(`${this.url(id)}/signals`, input)
  }

  updateSignal(id: string, signalId: string, input: PluginSignalInput) {
    return this.http.put<PluginSignalDto>(`${this.url(id)}/signals/${encodeURIComponent(signalId)}`, input)
  }

  removeSignal(id: string, signalId: string) {
    return this.http.delete(`${this.url(id)}/signals/${encodeURIComponent(signalId)}`)
  }

  /** plugin signals (existing or new) with a Loxone signal and a wire each; a failed item is undone, the others stay */
  bridge(id: string, request: BridgeRequest) {
    return this.http.post<BridgeResultDto[]>(`${this.url(id)}/bridge`, request)
  }

  /** only while running (409 otherwise) */
  catalog(id: string) {
    return this.http.get<CatalogNode[]>(`${this.url(id)}/catalog`)
  }

  /** null when the plugin has no panel; only while running (409 otherwise) */
  panel(id: string) {
    return this.http.get<Panel | null>(`${this.url(id)}/panel`)
  }

  logs(id: string) {
    return this.http.get<PluginLogLineDto[]>(`${this.url(id)}/logs`)
  }

  private url(id: string) {
    return `/api/plugin-instances/${encodeURIComponent(id)}`
  }
}
