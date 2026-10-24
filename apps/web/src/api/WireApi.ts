import type { WireDto, WireInputDto, WirePreviewDto, WirePreviewRequest } from "@lox-nexus/api"
import type { Http } from "./Http.ts"

/** /api/wires: connections between signals, and the preview of their transforms */
export class WireApi {
  constructor(private readonly http: Http) {}

  /** includes wires the server can't run (`active: false`, with `problem`) */
  list() {
    return this.http.get<WireDto[]>("/api/wires")
  }

  /** 409 when the target already has a wire or a signal is gone */
  create(input: WireInputDto) {
    return this.http.post<WireDto>("/api/wires", input)
  }

  /** also restarts a stored wire that isn't running; on failure the old one keeps running */
  update(id: string, input: WireInputDto) {
    return this.http.put<WireDto>(this.url(id), input)
  }

  remove(id: string) {
    return this.http.delete(this.url(id))
  }

  /** runs nothing; a 400 names the faulty transform field */
  preview(request: WirePreviewRequest) {
    return this.http.post<WirePreviewDto>("/api/wires/preview", request)
  }

  private url(id: string) {
    return `/api/wires/${encodeURIComponent(id)}`
  }
}
