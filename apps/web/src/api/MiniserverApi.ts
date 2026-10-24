import type {
  AdoptPacket, DiscoveredPacketDto, LoxoneProjectDto, LoxoneSignalDto, LoxoneSignalInput, MiniserverDto, MiniserverInput, MiniserverLoadDto, ProjectRead
} from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/miniservers and their signals and discovered packets */
export class MiniserverApi {
  constructor(private readonly http: Http) {}

  list() {
    return this.http.get<MiniserverDto[]>("/api/miniservers")
  }

  get(id: string) {
    return this.http.get<MiniserverDto>(`/api/miniservers/${encodeURIComponent(id)}`)
  }

  create(input: MiniserverInput) {
    return this.http.post<MiniserverDto>("/api/miniservers", input)
  }

  update(id: string, input: MiniserverInput) {
    return this.http.put<MiniserverDto>(`/api/miniservers/${encodeURIComponent(id)}`, input)
  }

  remove(id: string) {
    return this.http.delete(`/api/miniservers/${encodeURIComponent(id)}`)
  }

  /** current intercommunication load and the last hour of samples */
  load(id: string) {
    return this.http.get<MiniserverLoadDto>(`/api/miniservers/${encodeURIComponent(id)}/load`)
  }

  start(id: string) {
    return this.http.post<MiniserverDto>(`/api/miniservers/${encodeURIComponent(id)}/start`)
  }

  stop(id: string) {
    return this.http.post<MiniserverDto>(`/api/miniservers/${encodeURIComponent(id)}/stop`)
  }

  signals(id: string) {
    return this.http.get<LoxoneSignalDto[]>(`/api/miniservers/${encodeURIComponent(id)}/signals`)
  }

  addSignal(id: string, input: LoxoneSignalInput) {
    return this.http.post<LoxoneSignalDto>(`/api/miniservers/${encodeURIComponent(id)}/signals`, input)
  }

  /** keeps the signal's wires; its last value and a force move to the new topic */
  updateSignal(id: string, signalId: string, input: LoxoneSignalInput) {
    return this.http.put<LoxoneSignalDto>(`/api/miniservers/${encodeURIComponent(id)}/signals/${encodeURIComponent(signalId)}`, input)
  }

  removeSignal(id: string, signalId: string) {
    return this.http.delete(`/api/miniservers/${encodeURIComponent(id)}/signals/${encodeURIComponent(signalId)}`)
  }

  discovered(id: string) {
    return this.http.get<DiscoveredPacketDto[]>(`/api/miniservers/${encodeURIComponent(id)}/discovered`)
  }

  adopt(id: string, input: AdoptPacket) {
    return this.http.post<LoxoneSignalDto>(`/api/miniservers/${encodeURIComponent(id)}/discovered/adopt`, input)
  }

  /** the intercommunication part of the Miniserver's Loxone Config project, read over FTP with this login */
  readProject(id: string, login: ProjectRead) {
    return this.http.post<LoxoneProjectDto>(`/api/miniservers/${encodeURIComponent(id)}/project`, login)
  }
}
