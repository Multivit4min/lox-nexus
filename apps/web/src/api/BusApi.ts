import type { BusMessageDto, ForceDto, ForceRequest, InjectRequest, SignalDto, TraceNodeDto } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/bus and /api/signals: what the inspector needs besides the stream */
export class BusApi {
  constructor(private readonly http: Http) {}

  recent(limit: number, pattern?: string) {
    const query = new URLSearchParams({ limit: String(limit), ...(pattern ? { pattern } : {}) })
    return this.http.get<BusMessageDto[]>(`/api/bus/messages?${query}`)
  }

  trace(id: string) {
    return this.http.get<TraceNodeDto[]>(`/api/bus/messages/${encodeURIComponent(id)}/trace`)
  }

  forces() {
    return this.http.get<ForceDto[]>("/api/bus/forces")
  }

  force(request: ForceRequest) {
    return this.http.post<void>("/api/bus/forces", request)
  }

  release(topic: string) {
    return this.http.delete(`/api/bus/forces?${new URLSearchParams({ topic })}`)
  }

  inject(request: InjectRequest) {
    return this.http.post<void>("/api/bus/inject", request)
  }

  signals() {
    return this.http.get<SignalDto[]>("/api/signals")
  }
}
